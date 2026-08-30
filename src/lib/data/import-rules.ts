/**
 * What an archive has to be before it is opened, and how much of it there may
 * be.
 *
 * The same arrangement [upload-rules] and [import-files] describe, for the same
 * reason: the browser reads these to refuse an archive before spending a minute
 * on it, and the server reads them again because the browser is not the
 * control. Every note in an archive arrives at a Server Action that re-checks
 * its size, and every image at `/api/uploads`, which re-checks its type and its
 * bytes.
 *
 * **Where the archive is opened, and why it is opened there.** The zip is
 * unpacked in the browser, and that is not a preference. A Server Action on
 * this platform accepts a two-megabyte payload and a Route Handler four and a
 * half; an archive of a real collection is a hundred times either. There is no
 * arrangement in which a whole archive is handed to the server in one request.
 * So the browser opens it and feeds the pieces through the endpoints that
 * already existed — which has the pleasant side effect that the import can say
 * what it found *before* it writes anything.
 *
 * **What that costs, stated plainly.** The caps below are enforced in the
 * browser first, which means a crafted archive can cost the person who opened
 * it a tab. That is the whole of the exposure: it is their own tab, their own
 * memory, and a file they chose. Nothing about the server's caps depends on the
 * browser having applied these — see [importArchiveNotes] and the upload route.
 */

/** The file dialog's filter. */
export const ARCHIVE_ACCEPT = ".zip,application/zip";

export function isArchiveFile(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

/**
 * The `.zip` itself, on disk.
 *
 * Generous, because this is a backup: a collection with four hundred images in
 * it is a real collection, not an attack. The number that actually protects
 * anything is the unpacked one below.
 */
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

/**
 * Everything the archive *claims* it unpacks to, summed.
 *
 * This is the zip bomb cap, and it is checked against the central directory
 * before a single byte is inflated — fflate's `filter` runs over the headers,
 * so a 42.zip declaring terabytes is turned away without being decompressed.
 *
 * A header that *lies* is handled a layer down rather than here: fflate
 * allocates exactly the declared size for each entry and inflates into it, so
 * an entry claiming a megabyte and holding a gigabyte produces a truncated
 * megabyte and an error, not an allocation. The bound is the declaration
 * either way, which is what makes checking the declaration meaningful.
 */
export const MAX_ARCHIVE_UNPACKED_BYTES = 512 * 1024 * 1024;

/** Entries, of any kind. A folder of this many files is not one of ours. */
export const MAX_ARCHIVE_ENTRIES = 5000;

/**
 * Notes in one archive.
 *
 * Higher than [MAX_IMPORT_FILES] by two orders of magnitude, and it has to be:
 * that cap is about a *drop*, where each file was aimed by hand and twenty-five
 * is already more than anyone means to drag. An archive is a whole collection
 * arriving at once, and a restore that silently stopped at twenty-five would be
 * worse than no restore at all.
 */
export const MAX_ARCHIVE_NOTES = 5000;

/** Images in one archive. */
export const MAX_ARCHIVE_IMAGES = 5000;

/**
 * Notes per call to the import action.
 *
 * A cap on the *request*, not on the archive: the batching in
 * [batchImportFiles] already keeps a payload under the action's size limit, and
 * this keeps one under its row count too. The client sends as many calls as it
 * takes.
 */
export const MAX_ARCHIVE_NOTES_PER_CALL = 200;

/** How many images are uploaded at once. */
export const IMAGE_UPLOAD_CONCURRENCY = 4;
