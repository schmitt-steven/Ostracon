"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { notes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/require-auth";
import { stringifyContentMd } from "./frontmatter";
import { uniqueSlugFor } from "./slug";
import { syncLinksForNote } from "./wikilinks";

const NoteInput = z.object({
  // Title is intentionally optional: a very common flow is opening a new
  // note and typing the body first. An empty title falls back to
  // "Untitled" for display (page.tsx, NoteEditor) and to "note" for the
  // slug (uniqueSlugFor) rather than blocking the save.
  title: z.string().max(300),
  bodyMd: z.string(),
  tags: z.array(z.string()).max(50),
});

export type CreateNoteResult = { id: string; slug: string; version: number };

export async function createNote(input: unknown): Promise<CreateNoteResult> {
  await requireAuth();
  const { title, bodyMd, tags } = NoteInput.parse(input);
  const slug = await uniqueSlugFor(title);
  const contentMd = stringifyContentMd({ title, tags }, bodyMd);

  const [row] = await db
    .insert(notes)
    .values({ slug, title, tags, contentMd })
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
  const contentMd = stringifyContentMd({ title, tags }, bodyMd);

  // Slug is intentionally never re-derived from title here — fixed at
  // creation so URLs/bookmarks/backlink hrefs survive renames.
  const [updated] = await db
    .update(notes)
    .set({
      title,
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

export async function deleteNote(id: string): Promise<void> {
  await requireAuth();
  await db.delete(notes).where(eq(notes.id, id));
  revalidatePath("/");
}
