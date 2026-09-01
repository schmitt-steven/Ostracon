/**
 * Flattening a drop to a plain file list, folders included. `dataTransfer.files`
 * skips a dropped directory's contents (and omits the directory itself outside
 * Chromium), so we walk the entry tree instead — Chromium and Safari expose it,
 * Firefox falls back to the flat list.
 */

/** Enough to cover a note collection; past this the drop was a mistake. */
const MAX_ENTRIES = 200;

/** How deep a dropped tree is walked before we stop descending. */
const MAX_DEPTH = 8;

type DirEntry = FileSystemDirectoryEntry;
type FileEntry = FileSystemFileEntry;

export async function collectDroppedFiles(
  transfer: DataTransfer,
): Promise<File[]> {
  // webkitGetAsEntry must be called before any await — the item list is live
  // only during the drop event.
  const roots: FileSystemEntry[] = [];
  for (const item of transfer.items) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }

  if (roots.length === 0) return [...transfer.files];

  const files: File[] = [];
  const queue: Array<{ entry: FileSystemEntry; depth: number }> = roots.map(
    (entry) => ({ entry, depth: 0 }),
  );

  while (queue.length > 0 && files.length < MAX_ENTRIES) {
    const { entry, depth } = queue.shift()!;
    if (entry.isFile) {
      try {
        files.push(await readFile(entry as FileEntry));
      } catch {
        // A file that moved or was revoked mid-drop — dropped silently, same
        // as the flat-list path.
      }
    } else if (entry.isDirectory && depth < MAX_DEPTH) {
      for (const child of await readDir(entry as DirEntry)) {
        queue.push({ entry: child, depth: depth + 1 });
      }
    }
  }

  return files;
}

function readFile(entry: FileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** readEntries returns a page at a time; call it until it comes back empty. */
async function readDir(entry: DirEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const out: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    ).catch(() => [] as FileSystemEntry[]);
    if (batch.length === 0) break;
    out.push(...batch);
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}
