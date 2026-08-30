/**
 * What a file must be to become a note. One isomorphic module read by the file
 * input's `accept`, the drop handler and the server action alike.
 */

// Matched on the name — a dropped `.md`'s MIME type is unreliable across
// platforms.
const IMPORT_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

// The file dialog's filter. MIME types listed too, or macOS greys out files
// whose extension it doesn't recognise.
export const IMPORT_ACCEPT = [
  ...IMPORT_EXTENSIONS,
  "text/markdown",
  "text/plain",
].join(",");

/** Files per drop (not per collection) — each is its own slug lookup + insert. */
export const MAX_IMPORT_FILES = 25;

/** Per file. This much prose is already a book. */
export const MAX_IMPORT_BYTES = 512 * 1024;

// Text per import-action call. Server Actions cap at 2mb (next.config), and the
// batch is one encoded payload — kept well under, since encoding inflates it.
const MAX_BATCH_CHARS = 600_000;

/** A file that passed, read and ready to hand to the server. */
export type ImportFile = { name: string; text: string };

/**
 * Why a file didn't make it — the toast turns these into a sentence.
 * `no-note` isn't produced here: it's an image dropped with no note open, fed
 * in by [NoteImport] so a drop ends in one sentence.
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

function isImportableFile(name: string): boolean {
  return (IMPORT_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** Whether the file's contents should be read as markdown rather than as text. */
export function isMarkdownFile(name: string): boolean {
  const extension = extensionOf(name);
  return extension === ".md" || extension === ".markdown";
}

/**
 * The note's title: the filename minus its extension, otherwise untouched (no
 * case fixing, no dash-to-space). Capped at 300; empty for a file called
 * `.md`, which the server fills with the day title.
 */
export function titleFromFilename(name: string): string {
  const base = basename(name);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * Reads the dropped files, keeping the ones that qualify and naming the ones
 * that don't — nothing is refused silently.
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
      // A folder reported as a file, or a file that moved before the read.
      skipped.push({ name: file.name, reason: "unreadable" });
    }
  }

  return { accepted, skipped };
}

/**
 * Splits an import into send-sized payloads. Each batch holds at least one
 * file however large — an oversized single file is the server's to refuse.
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
