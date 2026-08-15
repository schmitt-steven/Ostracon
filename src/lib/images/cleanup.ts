import "server-only";
import { del } from "@vercel/blob";
import { ne } from "drizzle-orm";
import { db } from "@/db/client";
import { notes } from "@/db/schema";
import { isUploadedBlobUrl, referencedUrls } from "./references";

/**
 * Deletes the uploads a note's body points at, now that the note is gone.
 *
 * Call with the note's last known `contentMd`, after the row has been deleted
 * — the `ne` below keeps the result the same either way, so ordering is only a
 * matter of what the caller still has in hand.
 *
 * Best-effort by design: a blob the delete pass misses becomes a stray, which
 * the gallery already ignores (see `listStoredImages`), whereas throwing here
 * would report a failure for a note that really was deleted.
 */
export async function deleteNoteImages(
  noteId: string,
  contentMd: string,
): Promise<void> {
  // External images pasted into the note are referenced, not owned — only our
  // own uploads are ours to delete.
  const candidates = [
    ...new Set(referencedUrls(contentMd).filter(isUploadedBlobUrl)),
  ];
  if (candidates.length === 0) return;

  // An upload is only garbage once nothing points at it: markdown gets copied
  // between notes, and the copy keeps the original's URL.
  const others = await db
    .select({ contentMd: notes.contentMd })
    .from(notes)
    .where(ne(notes.id, noteId));
  const stillReferenced = new Set(
    others.flatMap((row) => referencedUrls(row.contentMd)),
  );

  const orphaned = candidates.filter((url) => !stillReferenced.has(url));
  if (orphaned.length === 0) return;

  try {
    await del(orphaned, {
      // Explicit for the same reason as the upload route — see the comment
      // there about OIDC resolution.
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (error) {
    console.error(`Failed to delete blobs for note ${noteId}`, error);
  }
}
