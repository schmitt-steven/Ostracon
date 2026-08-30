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
 * Opening an archive and deciding what, if anything, is in it worth importing.
 *
 * Nothing is written by this file and nothing is sent anywhere. It reads the
 * zip, applies every rule in [import-rules], and hands back a description the
 * interface can print — so the person importing sees "128 notes · 43 images,
 * exported 12 August" and presses a button, rather than finding out what was in
 * the file by looking at what it did to their collection afterwards.
 *
 * **The refusals happen in two places, in this order.** fflate's `filter` runs
 * over the central directory — the zip's own index — before anything is
 * inflated, which is where the size and count caps are applied and where a zip
 * bomb is turned away without being decompressed. Everything that needs to see
 * the actual bytes happens after: an image is what its magic number says it is
 * (see [sniffImageType]), never what its extension claims.
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
   * Whether the archive said it was ours. Decides whether each note's
   * frontmatter may name its own title, slug and dates — see [ImportedFile].
   */
  fromArchive: boolean;
  /** When it was written, when it says. Null for anything not ours. */
  exportedAt: string | null;
  /**
   * Files in the archive that are neither a note nor an image, counted so the
   * interface can say so.
   *
   * A zipped Obsidian vault carries `.canvas` files and an `.obsidian/` folder;
   * a folder zipped on a Mac carries `.DS_Store`. None of those are refusals —
   * the archive is fine and the import proceeds — but an import that quietly
   * dropped a third of what you handed it, with no number anywhere, reads as
   * the feature being broken rather than as the files being wrong.
   *
   * The manifest is not counted. It is part of the format rather than
   * something skipped, and reporting "1 other file" for every archive this app
   * wrote itself would make the number noise.
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
 * Entries the reader is prepared to look at, decided from the zip's index.
 *
 * Everything expensive is downstream of this function returning true, so it is
 * where the caps belong. It also carries the running totals, which is why it is
 * built per call rather than being a constant: `filter` is called once per
 * entry and is the only place that sees them all.
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
      // Directory entries are zero-length names ending in a slash; there is
      // nothing in them and the paths already carry the structure. Not
      // counted as skipped — a folder is not a file somebody expected back.
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
      // Per-entry caps, matched to what the thing will become: a note goes to
      // an action that refuses more than this, an image to an upload route
      // that refuses more than that. Anything else — a `.yaml`, a `.canvas`, a
      // `.DS_Store` — is not something this app stores, and is dropped here
      // without being decompressed.
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
 * The manifest, if there is one that says what we need it to say.
 *
 * A version from the future is refused rather than guessed at: a reader that
 * doesn't know what changed cannot know whether reading it anyway is safe, and
 * the archive is still perfectly importable as plain markdown, which is what
 * returning null here makes it.
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
    // A refusal recorded by the filter is the better explanation of the two,
    // because a filter that stopped reading is usually why the parse failed.
    return empty(refusal() ?? "That file isn't a zip archive we can read.");
  }
  const refused = refusal();
  if (refused) return empty(refused);

  const manifest = readManifest(unzipped[MANIFEST_NAME]);

  const notes: ArchiveNote[] = [];
  const images: ArchiveImage[] = [];
  // Starting from what the filter already turned away — those entries were
  // never decompressed, so this loop is the only place that could miss them.
  let ignored = filtered();

  for (const [name, bytes] of Object.entries(unzipped)) {
    // Part of the format, not a file that was skipped. See ArchiveReading.
    if (name === MANIFEST_NAME) continue;

    if (name.startsWith(IMAGES_DIR)) {
      // The extension is not evidence — a zip entry has no MIME type, so the
      // bytes are the only thing that can answer. An entry that isn't one of
      // the five formats this app stores is left where it is.
      const type = sniffImageType(bytes);
      if (!type || images.length >= MAX_ARCHIVE_IMAGES) {
        ignored += 1;
        continue;
      }
      const basename = name.slice(IMAGES_DIR.length);
      images.push({
        entry: name,
        // The sniffed type, not any claim the archive made. This is the `type`
        // the upload route will see, and it will sniff the bytes again anyway.
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
        // Strict UTF-8: a `.md` that isn't text is not a note, and decoding it
        // leniently would import a screenful of replacement characters.
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
