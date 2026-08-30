"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { MAX_IMPORT_BYTES } from "@/lib/notes/import-files";
import {
  insertImportedNotes,
  type ImportedNote,
} from "@/lib/notes/insert-imported";
import { rebuildAllLinks } from "@/lib/notes/rebuild-links";
import { MAX_ARCHIVE_NOTES_PER_CALL } from "./import-rules";

/**
 * An archive import's two writes: batches of notes ([importArchiveNotes]), then
 * one end-of-import call ([finishArchiveImport]) for work that can only run
 * once everything is in. Both are gated, public Server Actions. `fromArchive`
 * is set here, not taken from the payload — it decides whether frontmatter may
 * name a file's own title, slug and dates.
 */

const ArchiveNotesInput = z
  .array(
    z.object({
      name: z.string().min(1).max(300),
      // Char count against a byte cap — the conservative direction.
      text: z.string().max(MAX_IMPORT_BYTES),
    }),
  )
  .min(1)
  .max(MAX_ARCHIVE_NOTES_PER_CALL);

/**
 * One batch of an archive's notes, written and nothing else — no link sync
 * (links can't resolve until every note is in) and no revalidation.
 */
export async function importArchiveNotes(
  input: unknown,
): Promise<ImportedNote[]> {
  await requireAuth();
  const files = ArchiveNotesInput.parse(input);

  const created = await insertImportedNotes(
    files.map((file) => ({ ...file, fromArchive: true })),
  );
  return created.map(({ slug, title }) => ({ slug, title }));
}

/**
 * End-of-import work: rebuild links, revalidate from the root. Called even
 * after a partial failure — correct backlinks over a partial collection beats
 * a stale links table.
 */
export async function finishArchiveImport(): Promise<void> {
  await requireAuth();
  await rebuildAllLinks();
  revalidatePath("/", "layout");
}
