"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  insertImportedNotes,
  type ImportedNote,
} from "./insert-imported";
import { MAX_IMPORT_BYTES, MAX_IMPORT_FILES } from "./import-files";
import { syncLinksForNote } from "./wikilinks";

export type { ImportedNote };

// Validated, not trusted — a signed-in POST endpoint. The client checks (see
// import-files) only explain refusals.
const ImportInput = z
  .array(
    z.object({
      name: z.string().min(1).max(300),
      // Char count against a byte cap — the conservative direction.
      text: z.string().max(MAX_IMPORT_BYTES),
    }),
  )
  .min(1)
  .max(MAX_IMPORT_FILES);

/**
 * Turns dropped or picked files into notes, one per file. The shared read/write
 * is in [insertImportedNotes]; here is the drop-only part: `fromArchive` is
 * false and the filename is the title. Links are synced per note after every
 * note is in (a drop is small enough not to need [rebuildAllLinks]). No
 * `refresh()`, matching [createNote].
 */
export async function importNotes(input: unknown): Promise<ImportedNote[]> {
  await requireAuth();
  const files = ImportInput.parse(input);

  const created = await insertImportedNotes(
    files.map((file) => ({ ...file, fromArchive: false })),
  );

  const affected = new Set<string>();
  for (const note of created) {
    affected.add(note.slug);
    for (const slug of await syncLinksForNote(note.id, note.body)) {
      affected.add(slug);
    }
  }

  revalidatePath("/");
  for (const slug of affected) revalidatePath(`/notes/${slug}`);

  return created.map(({ slug, title }) => ({ slug, title }));
}
