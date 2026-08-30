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
 * Running an import that has already been read and agreed to.
 *
 * **Images first, and that ordering is the whole shape of this file.** A note's
 * body points at `images/1740-diagram.png`, which is a place in a zip and not
 * anywhere a browser can load from. It only becomes a URL once the image has
 * been uploaded again — so every image goes up, the map of
 * archive-path-to-new-URL is built, and only then are the bodies rewritten and
 * the notes written. Done the other way round, every note would be saved
 * pointing at a path that resolves to nothing, and would need a second pass to
 * repair.
 *
 * An image that fails to upload does not stop the import. The note that
 * referenced it keeps the relative path, which renders as a broken image — a
 * visible, fixable gap in one note, rather than a restore that refused to
 * finish because one file of four hundred was rejected.
 *
 * **Notes go in batches, because a Server Action payload is finite.** The same
 * [batchImportFiles] the drop path uses, and for the same reason. What is
 * different is what happens at the end: links cannot be resolved batch by batch
 * (see [rebuildAllLinks]), so [finishArchiveImport] closes the import once —
 * including when a batch failed, because correct backlinks over a partial
 * collection beats a links table describing a collection that no longer exists.
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
 * Uploads in a small handful at a time.
 *
 * Sequentially, four hundred images is four hundred round trips end to end and
 * a progress bar that crawls; all at once it is four hundred concurrent
 * requests, which the browser queues six-deep anyway and the upload route meets
 * as a stampede. Four is enough to keep the connection busy and few enough that
 * a failure is attributable.
 *
 * Order is not preserved and does not need to be — the result is a map.
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
    // One batch at a time: Server Actions are dispatched serially per client
    // regardless, and sending them in parallel would only make a failure
    // halfway through harder to describe.
    for (const batch of batchImportFiles(files)) {
      written += (await importArchiveNotes(batch)).length;
      onProgress({ phase: "notes", done: written, total: files.length });
    }
  } catch {
    // The action throws on a payload it won't take, and redirects to /login on
    // an expired session — which arrives here as a rejected promise too.
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
