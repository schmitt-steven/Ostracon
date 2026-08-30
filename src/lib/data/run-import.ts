"use client";

import { postImage } from "@/lib/images/upload-client";
import { batchImportFiles } from "@/lib/notes/import-files";
import { toAbsoluteImages } from "./archive";
import {
  finishArchiveImport,
  importArchiveNotes,
} from "./import-actions";
import { IMAGE_UPLOAD_CONCURRENCY } from "./import-rules";
import type { ArchiveReading } from "./read-archive";

/**
 * Runs an import that's already been read and agreed to.
 *
 * Images first: a note body points at `images/…`, which only becomes a URL
 * once the image is re-uploaded — so all images go up, the path→URL map is
 * built, then bodies are rewritten and notes written. A failed image doesn't
 * stop the import; its note keeps a relative path that renders broken.
 *
 * Notes go in batches ([batchImportFiles]) since a Server Action payload is
 * finite. [finishArchiveImport] closes the import once, even after a partial
 * failure.
 */

export type ImportProgress =
  | { phase: "images"; done: number; total: number }
  | { phase: "notes"; done: number; total: number }
  | { phase: "finishing" };

export type ImportOutcome = {
  notes: number;
  images: number;
  /** Images that wouldn't upload. Their notes keep a link that won't resolve. */
  failedImages: number;
  /** Set when a batch of notes was refused; what landed before it still did. */
  error: string | null;
};

/**
 * Uploads [IMAGE_UPLOAD_CONCURRENCY] at a time — enough to keep the connection
 * busy, few enough that a failure is attributable. Order isn't preserved (the
 * result is a map).
 */
async function uploadImages(
  images: ArchiveReading["images"],
  onProgress: (progress: ImportProgress) => void,
): Promise<{ urlByEntry: Map<string, string>; failed: number }> {
  const urlByEntry = new Map<string, string>();
  let done = 0;
  let failed = 0;

  const queue = [...images];
  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        urlByEntry.set(next.entry, await postImage(next.file));
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress({ phase: "images", done, total: images.length });
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(IMAGE_UPLOAD_CONCURRENCY, queue.length) },
      worker,
    ),
  );
  return { urlByEntry, failed };
}

export async function runArchiveImport(
  reading: ArchiveReading,
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportOutcome> {
  const { urlByEntry, failed } = await uploadImages(reading.images, onProgress);

  const files = reading.notes.map((note) => ({
    name: note.name,
    text: toAbsoluteImages(note.text, urlByEntry),
  }));

  let written = 0;
  let error: string | null = null;
  onProgress({ phase: "notes", done: 0, total: files.length });

  try {
    // One batch at a time — Server Actions dispatch serially per client anyway.
    for (const batch of batchImportFiles(files)) {
      written += (await importArchiveNotes(batch)).length;
      onProgress({ phase: "notes", done: written, total: files.length });
    }
  } catch {
    // Throws on an oversized payload or an expired session.
    error = "Some notes couldn't be imported.";
  }

  onProgress({ phase: "finishing" });
  try {
    await finishArchiveImport();
  } catch {
    error ??= "The import finished, but backlinks may be out of date.";
  }

  return {
    notes: written,
    images: urlByEntry.size,
    failedImages: failed,
    error,
  };
}
