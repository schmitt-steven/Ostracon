import "server-only";
import { count, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notes } from "@/db/schema";
import { normalizeTagList } from "@/lib/tags/parse";
import { defaultNoteTitle } from "./default-title";
import {
  readArchiveFrontmatter,
  stringifyContentMd,
  type ArchiveFrontmatter,
} from "./frontmatter";
import { isMarkdownFile, titleFromFilename } from "./import-files";
import { MAX_PINNED_NOTES } from "./pins";
import { claimSlug, takenSlugs } from "./slug";

/**
 * Turning files into rows — the half both ways in share.
 *
 * Two callers with two different ideas of what a file *is*. A `.md` dropped on
 * the window came from somewhere else and is read the way it always has been:
 * the filename is the title, because the filename is the only name the person
 * dropping it can see. A file out of one of our own archives came with a record
 * about itself, and that record wins — its title, its slug, the day it was
 * written. See [ImportedFile.fromArchive], which is the whole difference.
 *
 * Everything else is shared, and is shared because doing it per note does not
 * survive contact with a real collection: slugs are allocated against a set
 * held in memory rather than a query apiece, and the rows go in a few hundred
 * at a time rather than one at a time. Links are nobody's business here — see
 * [rebuildAllLinks] for why an import cannot resolve them as it goes.
 */

export type ImportedFile = {
  name: string;
  text: string;
  /**
   * Whether this file came out of an archive this app wrote — which is to say,
   * whether the manifest was there and said so. It is the reader's answer to
   * "may I believe this frontmatter", and nothing else turns on it.
   */
  fromArchive: boolean;
};

/** One note that landed. Enough for the toast to name it and link to it. */
export type ImportedNote = { slug: string; title: string };

/** The same, plus what a caller needs to sync links or revalidate a path. */
export type InsertedNote = ImportedNote & { id: string; body: string };

/** How many rows one insert statement carries. */
const INSERT_CHUNK = 100;

/**
 * What a file says about itself.
 *
 * A `.md` file that opens with a YAML block is one that came from a tool like
 * this one, and its frontmatter is a record *about* the note rather than part
 * of it — left in place it would render as a table at the top of the note and
 * then sit underneath a second block written by the save. So it is read, and
 * the rest is dropped. `.txt` files are never parsed: a text file that happens
 * to start with `---` is a text file that starts with `---`.
 */
function readFile(
  file: ImportedFile,
  now: Date,
): { data: ArchiveFrontmatter; body: string } {
  if (!isMarkdownFile(file.name)) {
    return {
      data: {
        title: null,
        tags: null,
        slug: null,
        created: null,
        updated: null,
        pinned: null,
      },
      body: file.text,
    };
  }
  return readArchiveFrontmatter(file.text, now);
}

/**
 * How many more notes may be pinned before the rail stops being scannable.
 *
 * A restored archive can ask for five pins; a hostile one can ask for five
 * hundred. The cap [setNotePinned] enforces on the button is enforced here too,
 * against what is already pinned, and the overflow is dropped rather than
 * refused — an import that failed because of the rail would be a strange thing
 * to explain.
 */
async function pinBudget(): Promise<number> {
  const [row] = await db
    .select({ pinned: count() })
    .from(notes)
    .where(isNotNull(notes.pinnedAt));
  return Math.max(0, MAX_PINNED_NOTES - (row?.pinned ?? 0));
}

export async function insertImportedNotes(
  files: ImportedFile[],
): Promise<InsertedNote[]> {
  if (files.length === 0) return [];

  const now = new Date();
  const [taken, budget] = await Promise.all([takenSlugs(), pinBudget()]);
  let pinsLeft = budget;

  const rows = files.map((file) => {
    const { data, body } = readFile(file, now);
    const trusted = file.fromArchive;

    // The archive's title, then the filename, then the day it arrived — the
    // same last resort [createNote] uses for a note saved without one, anchored
    // to the note's own creation date so a restored archive keeps the day
    // titles it had.
    const created = trusted ? (data.created ?? now) : now;
    const title =
      (trusted ? data.title?.trim() : "") ||
      titleFromFilename(file.name) ||
      defaultNoteTitle(created);

    const tags = normalizeTagList(data.tags ?? []).slice(0, 50);
    const slug = claimSlug(taken, title, trusted ? data.slug : null);

    // An archived pin is honoured while there is room for it. Order is the
    // archive's own, so the first five pinned notes in the file are the five
    // that come back.
    let pinnedAt: Date | null = null;
    if (trusted && data.pinned && pinsLeft > 0) {
      pinnedAt = data.pinned;
      pinsLeft -= 1;
    }

    return {
      slug,
      title,
      tags,
      contentMd: stringifyContentMd({ title, tags }, body),
      body,
      pinnedAt,
      createdAt: created,
      updatedAt: trusted ? (data.updated ?? created) : now,
    };
  });

  // The body travels with each row for the caller's benefit (link syncing
  // wants it) and is not a column, so it comes off before the insert.
  const values = rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    tags: row.tags,
    contentMd: row.contentMd,
    pinnedAt: row.pinnedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const idBySlug = new Map<string, string>();
  for (let i = 0; i < values.length; i += INSERT_CHUNK) {
    const written = await db
      .insert(notes)
      .values(values.slice(i, i + INSERT_CHUNK))
      .returning({ id: notes.id, slug: notes.slug });
    // Matched by slug rather than by position: RETURNING happens to come back
    // in insertion order, and "happens to" is not what a note's identity
    // should rest on. The slug is unique by definition.
    for (const row of written) idBySlug.set(row.slug, row.id);
  }

  return rows.flatMap((row) => {
    const id = idBySlug.get(row.slug);
    if (!id) return [];
    return [{ id, slug: row.slug, title: row.title, body: row.body }];
  });
}
