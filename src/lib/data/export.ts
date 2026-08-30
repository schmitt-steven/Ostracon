import "server-only";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { notes } from "@/db/schema";
import { isUploadedBlobUrl, referencedUrls } from "@/lib/images/references";
import { parseContentMd, stringifyExportMd } from "@/lib/notes/frontmatter";
import { resolveNoteTags } from "@/lib/tags/parse";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  imageEntryName,
  MANIFEST_NAME,
  toRelativeImages,
  uniqueFilenames,
  type ArchiveManifest,
} from "./archive";

/**
 * Everything in the collection, as a zip, written straight down the wire.
 *
 * **Streamed rather than built.** Not for elegance — a buffered response is
 * capped at a few megabytes on the platform this runs on, and an archive of a
 * real collection is mostly images. Streaming also means the function never
 * holds more than one image at a time, so the memory cost of exporting four
 * hundred of them is the same as exporting one.
 *
 * The consequence worth knowing: a stream that dies half way produces a zip
 * with no central directory, and every unzip tool on earth refuses that
 * outright. A truncated download is loud, which for a backup is the only
 * acceptable way for it to fail.
 *
 * **Text is deflated, images are stored.** A PNG or a WebP has already been
 * compressed once and spending CPU to grow it by a percent is a strange way to
 * make a download slower; markdown halves. So notes go through [ZipDeflate] and
 * uploads through [ZipPassThrough], which also means an image is copied from
 * the blob store to the client without ever being decoded.
 *
 * **The manifest is written last.** Zip readers work from the central
 * directory at the end of the file, so entry order is nobody's business but
 * ours — and writing the header last is what lets it report the images that
 * turned out to be missing, which is a fact only discovered by trying to fetch
 * them.
 */

/** A note as the archive needs it: everything, because the file carries it all. */
type ExportedNote = {
  slug: string;
  title: string;
  contentMd: string;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A timestamp fflate will accept in a zip entry.
 *
 * The DOS date field a zip carries cannot express a year outside 1980–2099,
 * and fflate refuses rather than truncating. Note dates are normally this
 * decade, but a note imported from a hand-written file can claim anything — so
 * the *filesystem* timestamp is clamped while the note's real date goes into
 * frontmatter untouched. The archive is the lossy one here, and only about the
 * thing filesystems were always going to be lossy about.
 */
const ZIP_EPOCH = new Date("1980-01-01T00:00:00.000Z");
const ZIP_LAST_DATE = new Date("2099-12-31T23:59:59.000Z");

function zipMtime(date: Date): Date {
  if (date < ZIP_EPOCH) return ZIP_EPOCH;
  if (date > ZIP_LAST_DATE) return ZIP_LAST_DATE;
  return date;
}

async function loadNotes(): Promise<ExportedNote[]> {
  // Oldest first, so the archive reads as the collection grew and two runs
  // over an unchanged collection produce the same file order.
  return db
    .select({
      slug: notes.slug,
      title: notes.title,
      contentMd: notes.contentMd,
      pinnedAt: notes.pinnedAt,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .orderBy(asc(notes.createdAt));
}

/**
 * Every upload the collection points at, mapped to its place in the archive.
 *
 * Built across all notes at once rather than per note, because markdown gets
 * copied between notes and the copy keeps the original's URL — the same image
 * referenced from three notes is one entry that all three point at, which is
 * also how [deleteNoteImages] already understands ownership.
 */
function imageEntries(rows: ExportedNote[]): Map<string, string> {
  const entryByUrl = new Map<string, string>();
  const taken = new Set<string>();

  for (const row of rows) {
    for (const url of referencedUrls(row.contentMd)) {
      // External images are referenced, not held: they stay absolute, and
      // fetching them would mean this app reaching out to arbitrary hosts on
      // a signed-in user's behalf.
      if (!isUploadedBlobUrl(url) || entryByUrl.has(url)) continue;
      const name = imageEntryName(url);
      // Two blobs whose pathnames sanitise to one name — vanishingly unlikely
      // given the store's timestamp prefix, and a silently overwritten image
      // is not a failure mode worth leaving open.
      if (!name || taken.has(name)) continue;
      taken.add(name);
      entryByUrl.set(url, name);
    }
  }
  return entryByUrl;
}

/** The file a note becomes: its own frontmatter, enriched, over its own body. */
function noteFile(row: ExportedNote, entryByUrl: Map<string, string>): string {
  const { data, body } = parseContentMd(row.contentMd);
  return stringifyExportMd(
    {
      title: row.title,
      tags: resolveNoteTags(data.tags, body),
      slug: row.slug,
      created: row.createdAt.toISOString(),
      updated: row.updatedAt.toISOString(),
      ...(row.pinnedAt ? { pinned: row.pinnedAt.toISOString() } : {}),
    },
    toRelativeImages(body, entryByUrl),
  );
}

/** The name the browser saves it under. */
export function archiveFilename(now = new Date()): string {
  return `knowledge-base-${now.toISOString().slice(0, 10)}.zip`;
}

export function exportArchiveStream(): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  // Deliberately not awaited: the response is the readable half, and this
  // fills the writable half for as long as the client keeps reading.
  void writeArchive(writable);
  return readable;
}

async function writeArchive(writable: WritableStream<Uint8Array>) {
  const writer = writable.getWriter();

  /**
   * The chain that carries fflate's output into the stream.
   *
   * fflate hands over finished chunks from a synchronous callback, and
   * `writer.write` is the thing that knows whether the client is keeping up.
   * Chaining them turns the second into backpressure for the first: every
   * producer step below awaits this before pushing more, so a slow download
   * throttles the blob fetch rather than filling memory with an archive
   * nobody is reading yet.
   */
  let flush: Promise<void> = Promise.resolve();
  let failure: unknown = null;

  const zip = new Zip((err, chunk, final) => {
    if (err) {
      failure ??= err;
      return;
    }
    flush = flush
      .then(() => writer.write(chunk))
      .catch((error: unknown) => {
        failure ??= error;
      });
    if (final) {
      flush = flush.then(() => writer.close()).catch(() => undefined);
    }
  });

  try {
    const rows = await loadNotes();
    const entryByUrl = imageEntries(rows);
    const filenames = uniqueFilenames(rows.map((row) => row.title));

    for (const [index, row] of rows.entries()) {
      const file = new ZipDeflate(filenames[index]!, { level: 6 });
      // A property rather than an option — fflate takes the compression
      // settings in the constructor and the entry's attributes on the object.
      file.mtime = zipMtime(row.updatedAt);
      zip.add(file);
      file.push(strToU8(noteFile(row, entryByUrl)), true);
      await flush;
      if (failure) throw failure;
    }

    const missingImages: string[] = [];
    for (const [url, name] of entryByUrl) {
      const copied = await copyImage(zip, url, name, () => flush);
      if (!copied) missingImages.push(name);
      await flush;
      if (failure) throw failure;
    }

    const manifest: ArchiveManifest = {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      exportedAt: new Date().toISOString(),
      counts: {
        notes: rows.length,
        images: entryByUrl.size - missingImages.length,
      },
      missingImages,
    };
    const header = new ZipDeflate(MANIFEST_NAME, { level: 6 });
    zip.add(header);
    header.push(strToU8(`${JSON.stringify(manifest, null, 2)}\n`), true);

    zip.end();
    await flush;
    if (failure) throw failure;
  } catch (error) {
    // Aborting is the point: the client is left with a zip that has no central
    // directory, which no tool will open. See the note at the top about why a
    // loud truncation beats a quiet one.
    await writer.abort(error).catch(() => undefined);
  }
}

/**
 * One upload, from the blob store into the archive without being decoded.
 *
 * The response is checked before the entry is added, so a blob that has been
 * deleted out from under a note leaves no half-written file behind — it is
 * reported in the manifest instead, and the note keeps its now-dangling
 * relative link, which is a truer record than silently dropping the reference.
 *
 * A failure *after* the entry is open is a different matter and is allowed to
 * throw: the archive is already committed to holding that file, and finishing
 * it short would produce a zip that opens and lies.
 */
async function copyImage(
  zip: Zip,
  url: string,
  name: string,
  flush: () => Promise<void>,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return false;
  }
  if (!response.ok || !response.body) return false;

  const file = new ZipPassThrough(name);
  zip.add(file);

  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    file.push(value, false);
    await flush();
  }
  file.push(new Uint8Array(0), true);
  return true;
}

/** What the settings row says the download would contain. */
export async function archiveContents(): Promise<{
  notes: number;
  images: number;
}> {
  const rows = await db
    .select({ contentMd: notes.contentMd })
    .from(notes);
  const images = new Set<string>();
  for (const row of rows) {
    for (const url of referencedUrls(row.contentMd)) {
      if (isUploadedBlobUrl(url)) images.add(url);
    }
  }
  return { notes: rows.length, images: images.size };
}
