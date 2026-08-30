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
 * Everything in the collection, as a zip streamed down the wire.
 *
 * - Streamed, not buffered: the platform caps a buffered response at a few MB,
 *   and this way memory stays at one image regardless of collection size. A
 *   stream that dies mid-way yields a zip with no central directory, which no
 *   tool will open — a loud failure, which for a backup is the right one.
 * - Text is deflated ([ZipDeflate]), images are stored ([ZipPassThrough]) —
 *   already-compressed formats don't shrink, and this way they're never decoded.
 * - The manifest is written last, so it can report the images that turned out
 *   to be missing.
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
 * A timestamp fflate will accept in a zip entry — the DOS date field can't
 * express a year outside 1980–2099. Only the filesystem timestamp is clamped;
 * the note's real date is untouched in frontmatter.
 */
const ZIP_EPOCH = new Date("1980-01-01T00:00:00.000Z");
const ZIP_LAST_DATE = new Date("2099-12-31T23:59:59.000Z");

function zipMtime(date: Date): Date {
  if (date < ZIP_EPOCH) return ZIP_EPOCH;
  if (date > ZIP_LAST_DATE) return ZIP_LAST_DATE;
  return date;
}

async function loadNotes(): Promise<ExportedNote[]> {
  // Oldest first — stable order across runs.
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
 * Every upload the collection points at, mapped to its archive path. Built
 * across all notes at once, so an image shared by three notes is one entry.
 */
function imageEntries(rows: ExportedNote[]): Map<string, string> {
  const entryByUrl = new Map<string, string>();
  const taken = new Set<string>();

  for (const row of rows) {
    for (const url of referencedUrls(row.contentMd)) {
      // External images are referenced, not held — stay absolute.
      if (!isUploadedBlobUrl(url) || entryByUrl.has(url)) continue;
      const name = imageEntryName(url);
      // Guard against two blobs sanitising to one name (very unlikely).
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
  // Not awaited — the response is the readable half; this fills the writable.
  void writeArchive(writable);
  return readable;
}

async function writeArchive(writable: WritableStream<Uint8Array>) {
  const writer = writable.getWriter();

  // Carries fflate's synchronous chunk callback into `writer.write`. Every
  // producer step awaits this, so a slow download backpressures the blob fetch.
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
      // A property, not a constructor option — that's fflate's API.
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
    // Abort deliberately — a zip with no central directory is a loud failure.
    await writer.abort(error).catch(() => undefined);
  }
}

/**
 * One upload copied into the archive without being decoded. A deleted blob is
 * caught before the entry is added (reported in the manifest); a failure after
 * the entry is open throws, since a short entry would make a zip that lies.
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
