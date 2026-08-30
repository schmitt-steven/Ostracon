/**
 * What an export archive is — the one description of the format, read by the
 * writer and the reader.
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
 * - Notes are named after their titles, at the root, so `[[Tag design]]`
 *   resolves against `Tag design.md` and an unzipped archive is a working
 *   Obsidian vault. The zip is a convenience — a plain folder drops in too.
 * - Image references are relative in the archive and absolute in the app: only
 *   our own uploads are rewritten; external URLs stay as written.
 * - The manifest (`kb-export.json`) says only what the archive *is*; every
 *   fact about a note is in that note's frontmatter. Its presence is what lets
 *   the importer trust frontmatter over filenames.
 *
 * Isomorphic — the server writes these names, the browser reads them back.
 */

/** Marks an archive as ours. Anything else is read as loose markdown. */
export const ARCHIVE_FORMAT = "se-knowledge-base/export";

/** Bumped when a reader would need to behave differently — not per added field. */
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
  /** Uploads a note points at that the blob store no longer had — named, not
   * just counted, so it's actionable. */
  missingImages: string[];
};

// The eight chars illegal in Windows filenames (the binding constraint).
// Spaces are fine and kept.
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;

// Control characters — illegal on Windows, invisible in listings, and a NUL
// can make one name look like another.
const CONTROL_CHARS = /\p{Cc}/gu;

/** Reserved on Windows whatever extension follows: `CON.md` cannot be created. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A filename that survives every filesystem the archive might be unzipped on.
 * Not reversible and doesn't need to be — the real title is in frontmatter.
 * See [uniqueFilenames] for the collision handling.
 */
function safeFilename(name: string, fallback = "untitled"): string {
  const cleaned = name
    .replace(CONTROL_CHARS, " ")
    .replace(ILLEGAL_FILENAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim()
    // Trailing dots/spaces at both ends — the Windows shell drops them.
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/, "");

  if (!cleaned) return fallback;
  if (RESERVED_NAMES.test(cleaned)) return `${cleaned}-note`;
  // Room for a " (12)" suffix and the extension inside the usual 255-byte cap.
  return cleaned.slice(0, 120);
}

/**
 * Filenames for a list of titles, collisions disambiguated as `Notes (2).md`.
 * Compared case-insensitively, since macOS and Windows are.
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
 * Where an upload goes in the archive. Keeps the blob store's name, timestamp
 * prefix and all, because that prefix is what keeps two `Screenshot.png`s apart.
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
 * A body with every absolute upload URL replaced by its archive path. Plain
 * string replacement — the URLs are long and opaque enough that it's safe.
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
 * Whether a zip entry's name is one we'll look at. Nothing here is used as a
 * path, so traversal can't escape — it's refused anyway (an archive with
 * `../../.ssh/...` wasn't made for us). Also rejects absolute paths, drive
 * letters, backslashes, control chars and over-long names.
 */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false;
  // `search`, not `test` — the global CONTROL_CHARS regex is stateful.
  if (name.search(/\p{Cc}/u) !== -1) return false;
  if (name.includes("\\")) return false;
  if (name.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(name)) return false;
  return !name.split("/").includes("..");
}
