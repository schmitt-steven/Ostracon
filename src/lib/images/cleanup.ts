import "server-only";
import { del } from "@vercel/blob";
import { ne } from "drizzle-orm";
import { db } from "@/db/client";
import { notes } from "@/db/schema";
import { isUploadedBlobUrl, referencedUrls } from "./references";

/**
 * Deletes the uploads a deleted note pointed at. Best-effort — a missed blob
 * becomes a stray the gallery ignores; throwing here would flag a delete that
 * actually succeeded.
 */
export async function deleteNoteImages(
  noteId: string,
  contentMd: string,
): Promise<void> {
  // Only our own uploads — external images are referenced, not owned.
  const candidates = [
    ...new Set(referencedUrls(contentMd).filter(isUploadedBlobUrl)),
  ];
  if (candidates.length === 0) return;

  // An upload is garbage only once nothing else points at it (markdown gets
  // copied between notes).
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
      // Explicit token — see the upload route's note on OIDC resolution.
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (error) {
    console.error(`Failed to delete blobs for note ${noteId}`, error);
  }
}
