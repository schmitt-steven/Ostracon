"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { notes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/require-auth";
import { deleteNoteImages } from "@/lib/images/cleanup";
import { defaultNoteTitle } from "./default-title";
import { stringifyContentMd } from "./frontmatter";
import { uniqueSlugFor } from "./slug";
import { linkedSlugs, syncLinksForNote } from "./wikilinks";

const NoteInput = z.object({
  // Title is intentionally optional: a very common flow is opening a new
  // note and typing the body first. An empty title is filled in with the
  // note's day (see defaultNoteTitle) rather than blocking the save, so what
  // reaches the column is never blank and every reader — list, backlinks,
  // slug — gets something to name the note by.
  title: z.string().max(300),
  bodyMd: z.string(),
  tags: z.array(z.string()).max(50),
});

/**
 * The day the note was started, for a note whose title was left empty. Read
 * from the row rather than taken as `now` so the fallback stays put: the
 * editor keeps sending the empty title it still holds locally, and each of
 * those saves has to land on the same title the last one did.
 */
async function dayTitleFor(id: string): Promise<string> {
  const [row] = await db
    .select({ createdAt: notes.createdAt })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1);
  // A missing row means the note was deleted mid-edit; the update below is
  // about to no-op on that same absence, so any title will do here.
  return defaultNoteTitle(row?.createdAt ?? new Date());
}

export type CreateNoteResult = { id: string; slug: string; version: number };

export async function createNote(input: unknown): Promise<CreateNoteResult> {
  await requireAuth();
  const { title, bodyMd, tags } = NoteInput.parse(input);
  const finalTitle = title.trim() ? title : defaultNoteTitle(new Date());
  const slug = await uniqueSlugFor(finalTitle);
  const contentMd = stringifyContentMd({ title: finalTitle, tags }, bodyMd);

  const [row] = await db
    .insert(notes)
    .values({ slug, title: finalTitle, tags, contentMd })
    .returning({ id: notes.id, slug: notes.slug, version: notes.version });
  if (!row) throw new Error("Failed to create note");

  const affectedSlugs = await syncLinksForNote(row.id, bodyMd);
  revalidatePath("/");
  for (const s of affectedSlugs) revalidatePath(`/notes/${s}`);
  return row;
}

const UpdateInput = NoteInput.extend({
  id: z.uuid(),
  expectedVersion: z.number().int(),
});

export type UpdateNoteResult =
  | { ok: true; version: number; slug: string }
  | {
      ok: false;
      conflict: true;
      version: number;
      contentMd: string;
      updatedAt: Date;
    }
  | { ok: false; deleted: true };

export async function updateNote(input: unknown): Promise<UpdateNoteResult> {
  await requireAuth();
  const { id, title, bodyMd, tags, expectedVersion } =
    UpdateInput.parse(input);
  // Clearing the title is the same intent as never having typed one, so it
  // lands back on the day title instead of leaving the note nameless.
  const finalTitle = title.trim() ? title : await dayTitleFor(id);
  const contentMd = stringifyContentMd({ title: finalTitle, tags }, bodyMd);

  // Slug is intentionally never re-derived from title here — fixed at
  // creation so URLs/bookmarks/backlink hrefs survive renames.
  const [updated] = await db
    .update(notes)
    .set({
      title: finalTitle,
      tags,
      contentMd,
      version: sql`${notes.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, id), eq(notes.version, expectedVersion)))
    .returning({ version: notes.version, slug: notes.slug });

  if (!updated) {
    const [current] = await db
      .select({
        version: notes.version,
        contentMd: notes.contentMd,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);
    if (!current) return { ok: false, deleted: true };
    return { ok: false, conflict: true, ...current };
  }

  const affectedSlugs = await syncLinksForNote(id, bodyMd);
  revalidatePath("/");
  revalidatePath(`/notes/${updated.slug}`);
  for (const s of affectedSlugs) revalidatePath(`/notes/${s}`);
  refresh();
  return { ok: true, version: updated.version, slug: updated.slug };
}

export async function deleteNote(input: unknown): Promise<void> {
  await requireAuth();
  const id = z.uuid().parse(input);

  // The body is read before the row goes, since it's the only record of which
  // uploads the note was holding.
  const [note] = await db
    .select({ slug: notes.slug, contentMd: notes.contentMd })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1);
  // Already gone — deleting the same note twice (a stale list, a double
  // submit) is a no-op, not an error.
  if (!note) return;

  const affectedSlugs = await linkedSlugs(id);

  // `links` rows at both ends cascade with the note (see schema).
  await db.delete(notes).where(eq(notes.id, id));
  await deleteNoteImages(id, note.contentMd);

  revalidatePath("/");
  revalidatePath(`/notes/${note.slug}`);
  for (const s of affectedSlugs) revalidatePath(`/notes/${s}`);
  refresh();
}
