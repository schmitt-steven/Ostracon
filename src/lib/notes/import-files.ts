/**
 * What a file has to be before it can become a note.
 *
 * One module rather than a rule per caller: the file input's `accept`, the
 * drop handler that never sees that input, and the server action that trusts
 * neither of them all read the same constants from here. It is deliberately
 * isomorphic — [titleFromFilename] and [isMarkdownFile] decide what gets
 * stored, so the server has to be able to run them itself rather than take
 * the browser's word for the answer.
 */

/**
 * Extensions the importer takes, matched on the name rather than on the
 * file's MIME type: a dropped `.md` arrives as `text/markdown` on some
 * platforms, `text/plain` on others and an empty string on plenty, so the
 * type is not something a filter can be built on.
 */
export const IMPORT_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

/**
 * The file dialog's filter. The MIME types are listed alongside the
 * extensions because macOS's dialog greys out files whose extension it
 * doesn't recognise unless the type is named too.
 */
export const IMPORT_ACCEPT = [
  ...IMPORT_EXTENSIONS,
  "text/markdown",
  "text/plain",
].join(",");

/**
 * How many files one import may carry.
 *
 * A cap on the drop, not on the collection: each file is its own slug lookup,
 * insert and link sync, so a folder of two hundred dropped at once is a
 * request that would sit there for a minute with nothing to show for it. What
 * doesn't fit is reported rather than silently dropped.
 */
export const MAX_IMPORT_FILES = 25;

/** Per file. Prose this size is already a book, and anything bigger is a mistake. */
export const MAX_IMPORT_BYTES = 512 * 1024;

/**
 * How much text one call to the import action may carry.
 *
 * Server Actions are capped at `serverActions.bodySizeLimit` (2mb, see
 * next.config), and the whole batch travels as one encoded payload — so a
 * dozen large files have to be handed over in several calls rather than
 * refused. Well under the limit: the encoding is bigger than the text.
 */
const MAX_BATCH_CHARS = 600_000;

/** A file that passed, read and ready to hand to the server. */
export type ImportFile = { name: string; text: string };

/**
 * Why a file didn't make it. The toast turns these into a sentence.
 *
 * `no-note` is the odd one out: it is never produced here, because it isn't
 * about the file at all. It is an image dropped with no note open — see
 * [NoteImport], which hands it over so that one drop still ends in one
 * sentence rather than two notices.
 */
export type SkipReason =
  | "type"
  | "size"
  | "too-many"
  | "unreadable"
  | "no-note";

export type SkippedFile = { name: string; reason: SkipReason };

/** The filename, with any path the drop came with taken off the front. */
function basename(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

function extensionOf(name: string): string {
  const base = basename(name);
  const dot = base.lastIndexOf(".");
  // `dot > 0` rather than `>= 0`: a dotfile is all extension and no name.
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

export function isImportableFile(name: string): boolean {
  return (IMPORT_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** Whether the file's contents should be read as markdown rather than as text. */
export function isMarkdownFile(name: string): boolean {
  const extension = extensionOf(name);
  return extension === ".md" || extension === ".markdown";
}

/**
 * The note's title: the filename with its extension taken off.
 *
 * Nothing else is done to it — no case fixing, no dashes turned into spaces.
 * The file is already named whatever its author called the note, and a title
 * that doesn't match the file it came from is one you can't find again by
 * searching for what you dropped.
 *
 * Capped at the 300 the note input allows. Empty (a file called `.md`) is
 * returned as empty; the server fills those in with the day title, exactly as
 * it does for a note saved without one.
 */
export function titleFromFilename(name: string): string {
  const base = basename(name);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * Reads what the browser handed over, keeping the files that qualify and
 * naming the ones that don't.
 *
 * Nothing is refused silently. A drop is aimed by hand, and a file that
 * vanishes without a word reads as the feature being broken rather than as
 * the file being wrong.
 */
export async function readImportFiles(files: File[]): Promise<{
  accepted: ImportFile[];
  skipped: SkippedFile[];
}> {
  const accepted: ImportFile[] = [];
  const skipped: SkippedFile[] = [];

  for (const file of files) {
    if (!isImportableFile(file.name)) {
      skipped.push({ name: file.name, reason: "type" });
      continue;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      skipped.push({ name: file.name, reason: "size" });
      continue;
    }
    if (accepted.length >= MAX_IMPORT_FILES) {
      skipped.push({ name: file.name, reason: "too-many" });
      continue;
    }
    try {
      accepted.push({ name: file.name, text: await file.text() });
    } catch {
      // A folder dragged in on a browser that reports it as a file, or a file
      // that moved between the drop and the read.
      skipped.push({ name: file.name, reason: "unreadable" });
    }
  }

  return { accepted, skipped };
}

/**
 * Splits an import into payloads small enough to send. Each batch holds at
 * least one file however large it is — a single file over the batch size is
 * the server's to refuse, not something to leave un-sent with no explanation.
 */
export function batchImportFiles(files: ImportFile[]): ImportFile[][] {
  const batches: ImportFile[][] = [];
  let batch: ImportFile[] = [];
  let chars = 0;

  for (const file of files) {
    if (batch.length > 0 && chars + file.text.length > MAX_BATCH_CHARS) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(file);
    chars += file.text.length;
  }
  if (batch.length > 0) batches.push(batch);

  return batches;
}
