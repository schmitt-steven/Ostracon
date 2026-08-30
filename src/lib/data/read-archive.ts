"use client";

import { unzip, type Unzipped, type UnzipFileInfo } from "fflate";
import { sniffImageType } from "@/lib/images/sniff";
import { MAX_IMAGE_BYTES } from "@/lib/images/upload-rules";
import { MAX_IMPORT_BYTES } from "@/lib/notes/import-files";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  IMAGES_DIR,
  isSafeEntryName,
  MANIFEST_NAME,
  NOTE_EXTENSION,
  type ArchiveManifest,
} from "./archive";
import {
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_IMAGES,
  MAX_ARCHIVE_NOTES,
  MAX_ARCHIVE_UNPACKED_BYTES,
} from "./import-rules";

/**
 * Opens an archive and describes what's importable in it — writes nothing,
 * sends nothing. Refusals happen in two stages: fflate's `filter` applies the
 * size/count caps over the central directory before anything is inflated;
 * byte-level checks (image type via [sniffImageType]) happen after.
 */

/** A note file, ready for the import action. */
export type ArchiveNote = { name: string; text: string };

/** An image, read out of the archive and ready to be uploaded again. */
export type ArchiveImage = {
  /** Its place in the archive, which is what note bodies point at. */
  entry: string;
  file: File;
};

export type ArchiveReading = {
  notes: ArchiveNote[];
  images: ArchiveImage[];
  /**
   * Whether the archive said it was ours — decides whether frontmatter may
   * name a note's own title, slug and dates (see [ImportedFile]).
   */
  fromArchive: boolean;
  /** When it was written, when it says. Null for anything not ours. */
  exportedAt: string | null;
  /**
   * Files that are neither a note nor an image (`.canvas`, `.DS_Store`, …),
   * counted so a partial import doesn't look broken. The manifest isn't
   * counted — it's part of the format.
   */
  ignored: number;
  /** Set when the archive was refused whole. Everything else is then empty. */
  refusal: string | null;
};

function empty(refusal: string): ArchiveReading {
  return {
    notes: [],
    images: [],
    fromArchive: false,
    exportedAt: null,
    ignored: 0,
    refusal,
  };
}

function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * The `filter` fflate calls per entry, deciding what's worth decompressing —
 * where the caps belong. Built per call because it carries the running totals.
 */
function entryFilter(): {
  filter: (file: UnzipFileInfo) => boolean;
  refusal: () => string | null;
  ignored: () => number;
} {
  let entries = 0;
  let unpacked = 0;
  let ignored = 0;
  let refusal: string | null = null;

  /** Refused here, so it is counted here — nothing downstream will ever see it. */
  function skip(): boolean {
    ignored += 1;
    return false;
  }

  return {
    refusal: () => refusal,
    ignored: () => ignored,
    filter(file) {
      entries += 1;
      if (entries > MAX_ARCHIVE_ENTRIES) {
        refusal ??= `That archive holds more than ${MAX_ARCHIVE_ENTRIES} files.`;
        return false;
      }
      // Directory entries — nothing in them; not counted as skipped.
      if (file.name.endsWith("/")) return false;
      if (!isSafeEntryName(file.name)) {
        refusal ??= "That archive holds a file with an unsafe name.";
        return false;
      }

      unpacked += file.originalSize;
      if (unpacked > MAX_ARCHIVE_UNPACKED_BYTES) {
        refusal ??= `That archive unpacks to more than ${mb(MAX_ARCHIVE_UNPACKED_BYTES)}.`;
        return false;
      }

      if (file.name === MANIFEST_NAME) return true;
      // Per-entry caps matched to what each becomes; anything else is dropped
      // undecompressed.
      if (file.name.toLowerCase().endsWith(NOTE_EXTENSION)) {
        return file.originalSize <= MAX_IMPORT_BYTES || skip();
      }
      if (file.name.startsWith(IMAGES_DIR)) {
        return file.originalSize <= MAX_IMAGE_BYTES || skip();
      }
      return skip();
    },
  };
}

function openZip(bytes: Uint8Array, filter: (f: UnzipFileInfo) => boolean) {
  return new Promise<Unzipped>((resolve, reject) => {
    unzip(bytes, { filter }, (error, unzipped) => {
      if (error) reject(error);
      else resolve(unzipped);
    });
  });
}

/**
 * The manifest, if valid. A version from the future returns null — the archive
 * is still importable as plain markdown.
 */
function readManifest(bytes: Uint8Array | undefined): ArchiveManifest | null {
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(decoder.decode(bytes));
    if (typeof parsed !== "object" || parsed === null) return null;
    const manifest = parsed as Partial<ArchiveManifest>;
    if (manifest.format !== ARCHIVE_FORMAT) return null;
    if (typeof manifest.version !== "number") return null;
    if (manifest.version > ARCHIVE_VERSION) return null;
    return manifest as ArchiveManifest;
  } catch {
    return null;
  }
}

export async function readArchive(file: File): Promise<ArchiveReading> {
  if (file.size > MAX_ARCHIVE_BYTES) {
    return empty(`That archive is over ${mb(MAX_ARCHIVE_BYTES)}.`);
  }

  const { filter, refusal, ignored: filtered } = entryFilter();
  let unzipped: Unzipped;
  try {
    unzipped = await openZip(new Uint8Array(await file.arrayBuffer()), filter);
  } catch {
    // A filter refusal is usually why the parse failed — prefer it.
    return empty(refusal() ?? "That file isn't a zip archive we can read.");
  }
  const refused = refusal();
  if (refused) return empty(refused);

  const manifest = readManifest(unzipped[MANIFEST_NAME]);

  const notes: ArchiveNote[] = [];
  const images: ArchiveImage[] = [];
  // Start from what the filter already turned away.
  let ignored = filtered();

  for (const [name, bytes] of Object.entries(unzipped)) {
    if (name === MANIFEST_NAME) continue;

    if (name.startsWith(IMAGES_DIR)) {
      // The bytes decide the type, not the extension.
      const type = sniffImageType(bytes);
      if (!type || images.length >= MAX_ARCHIVE_IMAGES) {
        ignored += 1;
        continue;
      }
      const basename = name.slice(IMAGES_DIR.length);
      images.push({
        entry: name,
        // The sniffed type — the upload route will sniff again anyway.
        file: new File([bytes as BlobPart], basename, { type }),
      });
      continue;
    }

    if (name.toLowerCase().endsWith(NOTE_EXTENSION)) {
      if (notes.length >= MAX_ARCHIVE_NOTES) {
        ignored += 1;
        continue;
      }
      try {
        // Strict UTF-8 — a `.md` that isn't text is not a note.
        notes.push({ name, text: decoder.decode(bytes) });
      } catch {
        ignored += 1;
      }
      continue;
    }

    ignored += 1;
  }

  if (notes.length === 0 && images.length === 0) {
    return empty("There are no notes in that archive.");
  }

  return {
    notes,
    images,
    fromArchive: manifest !== null,
    exportedAt: manifest?.exportedAt ?? null,
    ignored,
    refusal: null,
  };
}
