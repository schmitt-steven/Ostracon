/**
 * What an export archive *is* — the one description of the format, read by the
 * writer, by the reader, and by nothing else.
 *
 * A zip laid out as a folder of notes:
 *
 * ```
 * Setting up Neon.md
 * Tag design.md
 * images/1740000000000-diagram.png
 * kb-export.json
 * ```
 *
 * **Notes are named after their titles, at the root.** That is the whole
 * portability argument in one decision: `[[Tag design]]` resolves against a
 * file called `Tag design.md` and against nothing else, so an archive unzipped
 * into Obsidian is a working vault rather than a pile of slugs. It also means
 * the folder can be dragged onto this app's own window with no archive support
 * involved at all — [titleFromFilename] has taken the title off the filename
 * since long before this existed. The zip is a convenience, not a prerequisite,
 * and that is a property worth keeping.
 *
 * **Image references are made relative on the way out and absolute on the way
 * back.** A note's body holds the blob store's own URL; that URL is a fact
 * about this deployment, not about the note, and an archive full of them is a
 * backup that stops working the day the store is emptied. Only our own uploads
 * are rewritten — an image someone pasted from the open web is referenced
 * rather than held, and stays exactly as it was written.
 *
 * **The manifest is a header, not a second copy of the data.** Every fact
 * about a note lives in that note's own frontmatter, where a human reading the
 * folder can see it and a text editor can fix it. `kb-export.json` says only
 * what the archive *is*, which is the one thing no individual file can say —
 * and that claim is what licenses the importer to trust frontmatter over
 * filenames. Without it, a folder of markdown is read the way a dropped folder
 * of markdown has always been read.
 *
 * Isomorphic, and it has to be: the server writes these names and the browser
 * reads them back, and a sanitiser that existed in only one of those two places
 * would be a format that only round-trips by luck.
 */

/** Marks an archive as ours. Anything else is read as loose markdown. */
export const ARCHIVE_FORMAT = "se-knowledge-base/export";

/**
 * The format's version, bumped when a *reader* would need to behave
 * differently — not when a field is added. Adding `pinned` to frontmatter did
 * not need a bump, because an older reader that ignores it still gets the note.
 */
export const ARCHIVE_VERSION = 1;

export const MANIFEST_NAME = "kb-export.json";

/** Everything not a note. Trailing slash: it is matched as a prefix. */
export const IMAGES_DIR = "images/";

export const NOTE_EXTENSION = ".md";

export type ArchiveManifest = {
  format: typeof ARCHIVE_FORMAT;
  version: number;
  exportedAt: string;
  counts: { notes: number; images: number };
  /**
   * Uploads a note points at that the blob store no longer had. Named rather
   * than counted: the archive is the last chance to notice, and "three images
   * are gone" without saying which is a fact you can't act on.
   */
  missingImages: string[];
};

/**
 * Characters no filename may carry.
 *
 * Windows is the binding constraint and always is: these eight are illegal
 * there and merely inconvenient everywhere else. Spaces are deliberately not
 * among them — "Setting up Neon.md" is the entire point of naming files after
 * titles, and every filesystem still in use has taken spaces for decades.
 */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;

/**
 * Control characters, by Unicode category rather than by a range of escapes.
 * Illegal in Windows filenames, invisible in every listing, and a NUL in
 * particular is the oldest trick for making one name look like another to a
 * reader that stops at it.
 */
const CONTROL_CHARS = /\p{Cc}/gu;

/** Reserved on Windows whatever extension follows: `CON.md` cannot be created. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A filename that survives every filesystem the archive might be unzipped on.
 *
 * A trailing dot or space is dropped silently by the Windows shell, so `Note.`
 * and `Note` would become the same file; both ends are trimmed rather than
 * trusted.
 *
 * Nothing here is reversible, and nothing needs to be: the note's real title is
 * in its frontmatter, which is what an import of *our own* archive reads. The
 * filename only has to be recognisable to a person looking at a folder, and
 * unique enough that two notes don't become one file — see [uniqueFilenames].
 */
function safeFilename(name: string, fallback = "untitled"): string {
  const cleaned = name
    .replace(CONTROL_CHARS, " ")
    .replace(ILLEGAL_FILENAME_CHARS, "-")
    // Whitespace collapsed after the substitutions, so a title that held a
    // newline doesn't become a filename with a run of spaces in it.
    .replace(/\s+/g, " ")
    .trim()
    // Both ends, and after the trim: ". Note ." has to lose the dot at each.
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/, "");

  if (!cleaned) return fallback;
  if (RESERVED_NAMES.test(cleaned)) return `${cleaned}-note`;
  // 120 leaves room for a " (12)" disambiguator and the extension inside the
  // 255 bytes almost every filesystem stops at, even after UTF-8 expansion.
  return cleaned.slice(0, 120);
}

/**
 * Filenames for a list of titles, in order, with collisions disambiguated.
 *
 * Titles are not unique in this app and were never meant to be — two notes
 * called "Notes" is a thing that happens — but two files called `Notes.md` is
 * one file. The second one becomes `Notes (2).md`, which is what every desktop
 * does and what a person reading the folder will expect.
 *
 * Compared case-insensitively, because macOS and Windows are: `Setup.md` and
 * `setup.md` are two files on the machine that wrote the archive and one file
 * on the machine that unzips it.
 */
export function uniqueFilenames(titles: string[]): string[] {
  const taken = new Set<string>();
  return titles.map((title) => {
    const base = safeFilename(title);
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${base} (${suffix})`;
      suffix += 1;
    }
    taken.add(candidate.toLowerCase());
    return `${candidate}${NOTE_EXTENSION}`;
  });
}

/**
 * Where an upload goes in the archive, derived from its blob pathname.
 *
 * The store's own name is kept, timestamp prefix and all, rather than the
 * prettier one the gallery prints. That prefix is what makes blob pathnames
 * unique, and uniqueness is the only property this name actually needs — two
 * screenshots both called `Screenshot.png` must not become one entry.
 */
export function imageEntryName(blobUrl: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(blobUrl).pathname;
  } catch {
    return null;
  }
  const base = pathname.split("/").pop();
  if (!base) return null;
  return `${IMAGES_DIR}${safeFilename(decodeURIComponent(base), "image")}`;
}

/**
 * A body with every absolute upload URL replaced by its place in the archive.
 *
 * A plain string replacement rather than a rewrite of the markdown: an upload
 * URL can appear as `![](url)`, as `[text](url)`, inside raw HTML, or as a bare
 * line of text, and [referencedUrls] already knows about all of those. Swapping
 * the exact string it found leaves every syntax working and touches nothing
 * else — the URLs are long, opaque and store-specific, so there is no realistic
 * way for one to occur in prose meaning something different.
 */
export function toRelativeImages(
  bodyMd: string,
  entryByUrl: ReadonlyMap<string, string>,
): string {
  let out = bodyMd;
  for (const [url, entry] of entryByUrl) out = out.split(url).join(entry);
  return out;
}

/** The same swap in reverse, once the images have been uploaded again. */
export function toAbsoluteImages(
  bodyMd: string,
  urlByEntry: ReadonlyMap<string, string>,
): string {
  let out = bodyMd;
  for (const [entry, url] of urlByEntry) out = out.split(entry).join(url);
  return out;
}

/**
 * Whether a zip entry's name is one we are willing to look at.
 *
 * Nothing here is ever used as a path — notes become rows and images become
 * blobs under names this app generates — so a traversing entry cannot escape
 * anything. It is refused anyway, on the principle that an archive containing
 * `../../.ssh/authorized_keys` is not an archive that was made for us, and the
 * cheapest moment to say so is before anything has been decompressed.
 *
 * Absolute paths, drive letters, backslashes (a zip written by a careless
 * Windows tool, or one hoping a reader will split on the wrong separator),
 * control characters and anything unreasonably long all fall out here too.
 */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false;
  // The global flag on CONTROL_CHARS makes `test` stateful, so it is asked
  // through `search` instead — this is called once per entry in a loop.
  if (name.search(/\p{Cc}/u) !== -1) return false;
  if (name.includes("\\")) return false;
  if (name.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(name)) return false;
  return !name.split("/").includes("..");
}
