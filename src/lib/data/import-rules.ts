/**
 * What an archive may be, and how big. Like [upload-rules]/[import-files]: the
 * browser refuses early, the server re-checks (each note at a Server Action,
 * each image at `/api/uploads`).
 *
 * The zip is unpacked in the browser because no single server request can hold
 * a whole archive — the pieces feed the endpoints that already existed, which
 * also lets the import report what it found before writing. The caps below
 * enforced in-browser first; a crafted archive can only cost the opener a tab.
 */

/** The file dialog's filter. */
export const ARCHIVE_ACCEPT = ".zip,application/zip";

export function isArchiveFile(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

/** The `.zip` on disk. Generous — a backup, not an attack. */
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

/**
 * The zip-bomb cap: what the archive's headers *claim* it unpacks to, checked
 * before any byte is inflated. A lying header is caught a layer down — fflate
 * allocates the declared size and errors on overflow.
 */
export const MAX_ARCHIVE_UNPACKED_BYTES = 512 * 1024 * 1024;

/** Entries, of any kind. A folder of this many files is not one of ours. */
export const MAX_ARCHIVE_ENTRIES = 5000;

/** Notes in one archive — far above [MAX_IMPORT_FILES]; this is a full restore. */
export const MAX_ARCHIVE_NOTES = 5000;

/** Images in one archive. */
export const MAX_ARCHIVE_IMAGES = 5000;

/** Notes per call to the import action — a cap on the request, not the archive. */
export const MAX_ARCHIVE_NOTES_PER_CALL = 200;

/** How many images are uploaded at once. */
export const IMAGE_UPLOAD_CONCURRENCY = 4;
