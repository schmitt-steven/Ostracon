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
 * The two writes an archive import makes, and they are deliberately two.
 *
 * An archive arrives across several calls, because a collection is larger than
 * one Server Action payload. That means no single call can know the import is
 * finished — so the work that can only be done once, at the end, is its own
 * call: [finishArchiveImport].
 *
 * Both are `"use server"` and therefore public endpoints whatever the UI in
 * front of them looks like, so both are gated and both validate. `fromArchive`
 * is set *here* rather than taken from the payload: it is the flag that decides
 * whether a file's frontmatter may name its own title, slug and dates, and a
 * client that could set it could set them for a loose file too.
 */

const ArchiveNotesInput = z
  .array(
    z.object({
      name: z.string().min(1).max(300),
      // Characters against a byte cap, which is the conservative direction:
      // no UTF-8 string is shorter in bytes than it is in characters.
      text: z.string().max(MAX_IMPORT_BYTES),
    }),
  )
  .min(1)
  .max(MAX_ARCHIVE_NOTES_PER_CALL);

/**
 * One batch of an archive's notes, written and nothing else.
 *
 * No link sync and no revalidation, both on purpose. Links cannot be resolved
 * until every note is in (see [rebuildAllLinks]), and revalidating between
 * batches would rebuild the whole route tree once per batch to show a
 * collection that is still half-arrived.
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
 * Everything that can only be done once the last batch has landed.
 *
 * Called even when a batch failed part way — a half-imported collection whose
 * backlinks are correct is a better place to be left than one whose links
 * table still describes the collection as it was two batches ago.
 *
 * Revalidates the tree from the root rather than a list of paths: an import
 * touches the rail, the index, every tag page and the backlinks of notes that
 * were already here, and naming those one at a time for several hundred notes
 * is a longer list than the thing it is trying to avoid.
 */
export async function finishArchiveImport(): Promise<void> {
  await requireAuth();
  await rebuildAllLinks();
  revalidatePath("/", "layout");
}
