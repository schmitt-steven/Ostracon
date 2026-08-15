import "server-only";
import { list, type ListBlobResultBlob } from "@vercel/blob";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { notes } from "@/db/schema";

/** Matches the prefix the upload route writes under. */
const PREFIX = "notes/";

/** `id` is what the gallery matches against note search results. */
export type ImageOwner = { id: string; slug: string; title: string };

export type StoredImage = {
  url: string;
  /** Upload name with the timestamp prefix the upload route adds stripped off. */
  filename: string;
  size: number;
  uploadedAt: string;
  /** The note whose body points at this URL. */
  note: ImageOwner;
};

// Nothing records which note an upload belonged to — the URL is written
// straight into the markdown and that reference is the only link that exists.
// So ownership is recovered by reading it back out of the note bodies.
//
// Both syntaxes are covered: the paste handler writes `![alt](url)`, but an
// upload can also end up as a plain link or as raw HTML pasted into the note.
const MARKDOWN_TARGET_RE = /!?\[[^\]]*\]\(\s*<?([^\s)>]+)/g;
const HTML_SRC_RE = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;

// Safe to share these across calls: String.matchAll works on a clone, so it
// never leaves `lastIndex` behind on the module-level regex.
function referencedUrls(markdown: string): string[] {
  return [MARKDOWN_TARGET_RE, HTML_SRC_RE].flatMap((re) =>
    [...markdown.matchAll(re)]
      .map((m) => m[1])
      .filter((url): url is string => url !== undefined),
  );
}

async function ownersByUrl(): Promise<Map<string, ImageOwner>> {
  const rows = await db
    .select({
      id: notes.id,
      slug: notes.slug,
      title: notes.title,
      contentMd: notes.contentMd,
    })
    .from(notes)
    .orderBy(asc(notes.createdAt));

  const owners = new Map<string, ImageOwner>();
  for (const row of rows) {
    for (const url of referencedUrls(row.contentMd)) {
      // Oldest note wins. An image can be referenced from several notes once
      // its markdown gets copied around, but it was uploaded into whichever of
      // them existed first — which is what "the note it was uploaded in" means.
      if (!owners.has(url)) {
        owners.set(url, { id: row.id, slug: row.slug, title: row.title });
      }
    }
  }
  return owners;
}

async function listAllBlobs(): Promise<ListBlobResultBlob[]> {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  // list() caps out at 1000 per page and the gallery claims to show everything,
  // so the cursor is followed rather than silently truncating the tail.
  do {
    const page = await list({
      prefix: PREFIX,
      cursor,
      // Explicit token for the same reason as the upload route — see the
      // comment there about OIDC resolution.
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

function displayName(pathname: string): string {
  return pathname.slice(PREFIX.length).replace(/^\d+-/, "");
}

export async function listStoredImages(): Promise<StoredImage[]> {
  const [blobs, owners] = await Promise.all([listAllBlobs(), ownersByUrl()]);

  return blobs
    .flatMap((blob) => {
      const note = owners.get(blob.url);
      // A blob no note points at is a stray — markdown that was replaced or
      // deleted while the upload stayed behind. This is a view of the images
      // in the notes, not of the bucket, so those are left out rather than
      // shown as something to clean up.
      if (!note) return [];
      return [
        {
          url: blob.url,
          filename: displayName(blob.pathname),
          size: blob.size,
          uploadedAt: blob.uploadedAt.toISOString(),
          note,
        },
      ];
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
