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

// Validated here rather than trusted from the browser: the client's own checks
// (see import-files) are there to explain a refusal to the user, and this is a
// POST endpoint anyone signed in can reach with whatever payload they like.
const ImportInput = z
  .array(
    z.object({
      name: z.string().min(1).max(300),
      // Characters against a byte cap, which is the conservative direction:
      // no UTF-8 string is shorter in bytes than it is in characters.
      text: z.string().max(MAX_IMPORT_BYTES),
    }),
  )
  .min(1)
  .max(MAX_IMPORT_FILES);

/**
 * Turns dropped or picked files into notes, one note per file.
 *
 * The reading and the writing live in [insertImportedNotes], which the archive
 * import shares; what stays here is the part that is only true of a drop. These
 * files came from somewhere else, so `fromArchive` is false and the filename is
 * the title — the filename is what the user dropped and the only name they can
 * see while dropping it, and a note that arrives called something else is one
 * they have to go looking for.
 *
 * Links are synced only once every note is in, so that an import of a set of
 * notes that reference each other by `[[title]]` resolves within itself — half
 * the batch would otherwise be pointing at notes that hadn't been written yet.
 * That is per note here rather than a whole-table rebuild because a drop is
 * capped at [MAX_IMPORT_FILES] and a rebuild would be a bigger hammer than
 * twenty-five files deserve. An archive is not capped like that; see
 * [finishArchiveImport].
 *
 * No `refresh()`, matching [createNote]: the caller navigates once this
 * returns, and refreshing the route being left would tear down an editor
 * mid-sentence (see the note on `canRefreshShell` in ./actions).
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
