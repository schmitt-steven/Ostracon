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
 * Files → rows, the half both import paths share. The one difference is
 * `fromArchive`: an archived file's frontmatter (title, slug, dates) is
 * trusted; a plain drop uses the filename as title. Everything else — bulk
 * slug allocation, chunked inserts — is shared because per-note doesn't scale.
 * Links aren't touched here; see [rebuildAllLinks].
 */

export type ImportedFile = {
  name: string;
  text: string;
  /** Whether the archive manifest was present and said this file is ours —
   * i.e. whether its frontmatter may be believed. */
  fromArchive: boolean;
};

/** One note that landed. Enough for the toast to name it and link to it. */
export type ImportedNote = { slug: string; title: string };

/** The same, plus what a caller needs to sync links or revalidate a path. */
export type InsertedNote = ImportedNote & { id: string; body: string };

/** How many rows one insert statement carries. */
const INSERT_CHUNK = 100;

/**
 * What a file says about itself. A `.md` opening with a YAML block has its
 * frontmatter read and stripped; `.txt` is never parsed (a `---` there is just
 * a `---`).
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
 * Pins still available — [MAX_PINNED_NOTES] minus what's already pinned. An
 * archive asking for more has the overflow dropped, not refused.
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

    // Archive title, then filename, then the day title anchored to `created`.
    const created = trusted ? (data.created ?? now) : now;
    const title =
      (trusted ? data.title?.trim() : "") ||
      titleFromFilename(file.name) ||
      defaultNoteTitle(created);

    const tags = normalizeTagList(data.tags ?? []).slice(0, 50);
    const slug = claimSlug(taken, title, trusted ? data.slug : null);

    // Archived pins honoured in file order while budget lasts.
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

  // The body is for the caller (link syncing), not a column — dropped here.
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
    // Matched by slug, not position — RETURNING order isn't guaranteed.
    for (const row of written) idBySlug.set(row.slug, row.id);
  }

  return rows.flatMap((row) => {
    const id = idBySlug.get(row.slug);
    if (!id) return [];
    return [{ id, slug: row.slug, title: row.title, body: row.body }];
  });
}
