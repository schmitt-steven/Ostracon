"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { notes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/require-auth";
import { normalizeTagList } from "@/lib/tags/parse";
import { defaultNoteTitle } from "./default-title";
import { parseContentMd, stringifyContentMd } from "./frontmatter";
import {
  isMarkdownFile,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_FILES,
  titleFromFilename,
} from "./import-files";
import { uniqueSlugFor } from "./slug";
import { syncLinksForNote } from "./wikilinks";

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

/** One note that landed. Enough for the toast to name it and link to it. */
export type ImportedNote = { slug: string; title: string };

/**
 * What of a file becomes the note's body, and what of it becomes its filing.
 *
 * A `.md` file that opens with a YAML block is one that came from a tool like
 * this one, and its frontmatter is a record *about* the note rather than part
 * of it — left in place it would render as a table at the top of the note and
 * then sit underneath a second block written by the save. So it is read: the
 * `tags:` list files the note, and the rest is dropped.
 *
 * The title is not taken from it, deliberately. The filename is what the user
 * dropped and the only name they can see while dropping it; a note that
 * arrives called something else is one they have to go looking for. `.txt`
 * files are never parsed — a text file that happens to start with `---` is a
 * text file that starts with `---`.
 */
function readImported(
  name: string,
  text: string,
): { body: string; tags: string[] } {
  if (!isMarkdownFile(name)) return { body: text, tags: [] };
  try {
    const { data, body } = parseContentMd(text);
    return { body, tags: normalizeTagList(data.tags ?? []) };
  } catch {
    // Malformed YAML in the fence — the file is still a note, it just has an
    // odd first paragraph.
    return { body: text, tags: [] };
  }
}

/**
 * Turns dropped or picked files into notes, one note per file.
 *
 * Sequential rather than parallel, because [uniqueSlugFor] answers from the
 * rows that exist: two files called `Setup.md` in one drop have to see each
 * other's insert to come out as `setup` and `setup-2` rather than colliding on
 * the slug index.
 *
 * Links are synced only once every note is in, so that an import of a set of
 * notes that reference each other by `[[title]]` resolves within itself — half
 * the batch would otherwise be pointing at notes that hadn't been written yet.
 *
 * No `refresh()`, matching [createNote]: the caller navigates once this
 * returns, and refreshing the route being left would tear down an editor
 * mid-sentence (see the note on `canRefreshShell` in ./actions).
 */
export async function importNotes(input: unknown): Promise<ImportedNote[]> {
  await requireAuth();
  const files = ImportInput.parse(input);

  const created: { id: string; slug: string; title: string; body: string }[] =
    [];

  for (const file of files) {
    const { body, tags } = readImported(file.name, file.text);
    // As in [createNote]: a note whose name works out empty gets the day it
    // arrived rather than being left nameless.
    const title = titleFromFilename(file.name) || defaultNoteTitle(new Date());
    const slug = await uniqueSlugFor(title);

    const [row] = await db
      .insert(notes)
      .values({
        slug,
        title,
        tags,
        contentMd: stringifyContentMd({ title, tags }, body),
      })
      .returning({ id: notes.id });
    if (!row) continue;

    created.push({ id: row.id, slug, title, body });
  }

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
