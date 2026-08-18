import "server-only";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { links, notes } from "@/db/schema";
import { MAX_PINNED_NOTES } from "./pins";
import { isUploadedBlobUrl, referencedUrls } from "@/lib/images/references";
import {
  knownTagSet,
  noteSnippet,
  resolveNoteTags,
  tagMatches,
} from "@/lib/tags/parse";
import { parseContentMd } from "./frontmatter";
import { textLength } from "./text-length";

export type NoteOverview = {
  id: string;
  slug: string;
  title: string;
  /**
   * Read out of the note's frontmatter, not out of the `tags` column.
   *
   * The column is a derived index that a save rewrites (see notes/actions); it
   * exists for the GIN index, not as a second opinion. Deriving here means the
   * list can never show a tag the note itself has no record of — and it is
   * where a pre-tag-bar note gets read the old way exactly once (see
   * [resolveNoteTags]).
   */
  tags: string[];
  /** One line of prose under the title, hashtags removed. */
  snippet: string;
  /**
   * The uploads this note's body points at, deduplicated.
   *
   * Server-side only — `toLite` drops it, because the one thing that wants it
   * is the rail's image count and sending every URL of every note to the
   * browser to arrive at a single number would be a strange way to spend the
   * payload. It's derived here rather than queried separately because the body
   * is already open at this point; counting them anywhere else means reading
   * every note a second time.
   */
  imageUrls: string[];
  /**
   * How much is actually written in the note, markup discounted — the ranking
   * behind the "Longest" sort. Measured here rather than in the browser
   * because the body never crosses to the client on this path; only the number
   * derived from it does.
   */
  textLength: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function listNotesOverview(): Promise<NoteOverview[]> {
  // contentMd is pulled to be *read*, not just measured: the frontmatter tags
  // and the snippet both come out of it. This is a single-user knowledge base and the overview
  // already scans the whole table, so the alternative — a second round trip per
  // note, or trusting a denormalised column — buys nothing.
  const rows = await db
    .select({
      id: notes.id,
      slug: notes.slug,
      title: notes.title,
      contentMd: notes.contentMd,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .orderBy(desc(notes.updatedAt));

  return rows.map(({ contentMd, ...rest }) => {
    const { data, body } = parseContentMd(contentMd);
    return {
      ...rest,
      tags: resolveNoteTags(data.tags, body),
      snippet: noteSnippet(body),
      // Only our own uploads: a note also carries plain external image URLs,
      // and those are referenced rather than held by this collection.
      imageUrls: [
        ...new Set(referencedUrls(contentMd).filter(isUploadedBlobUrl)),
      ],
      textLength: textLength(body),
    };
  });
}

/** The overview as it crosses to the client — dates flattened to ISO strings. */
export type NoteOverviewLite = Omit<
  NoteOverview,
  "createdAt" | "updatedAt" | "imageUrls"
> & {
  createdAt: string;
  updatedAt: string;
};

/**
 * Field by field rather than a spread: this is the boundary where a server
 * type becomes a client one, and `imageUrls` must not cross it. Written out,
 * a field added to NoteOverview later fails to compile here until someone
 * decides whether the browser should see it — which a spread would answer
 * silently, and always with yes.
 */
export function toLite(note: NoteOverview): NoteOverviewLite {
  return {
    id: note.id,
    slug: note.slug,
    title: note.title,
    tags: note.tags,
    snippet: note.snippet,
    textLength: note.textLength,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * The notes an index route shows.
 *
 * `tag` null means every note; `untagged` narrows to the notes carrying none.
 * A parent tag matches its children (`#infra` includes `#infra/ci`), which is
 * what makes the rail's nested counts survive being clicked on.
 */
export function filterNotes(
  all: NoteOverview[],
  tag: string | null,
  untagged = false,
): NoteOverview[] {
  if (untagged) return all.filter((note) => note.tags.length === 0);
  if (!tag) return all;
  return all.filter((note) => note.tags.some((t) => tagMatches(t, tag)));
}

export type PinnedNote = { slug: string; title: string };

/**
 * The pinned notes, in the order they were pinned.
 *
 * Its own query rather than a filter over [listNotesOverview]: the rail needs
 * two columns of at most five rows, the overview reads and parses every note
 * in the table, and the two are wanted at the same moment — so this runs
 * alongside it instead of waiting for it.
 *
 * The limit repeats the cap the action already enforces. Belt and braces: if a
 * row ever slips past it, the rail stays the size it's drawn for rather than
 * growing a sixth line.
 */
export async function listPinnedNotes(): Promise<PinnedNote[]> {
  return db
    .select({ slug: notes.slug, title: notes.title })
    .from(notes)
    .where(isNotNull(notes.pinnedAt))
    .orderBy(asc(notes.pinnedAt))
    .limit(MAX_PINNED_NOTES);
}

export type Note = {
  id: string;
  slug: string;
  title: string;
  contentMd: string;
  tags: string[];
  version: number;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getNoteBySlug(slug: string): Promise<Note | undefined> {
  const [row] = await db
    .select()
    .from(notes)
    .where(eq(notes.slug, slug))
    .limit(1);
  return row;
}

/**
 * Every tag name that exists, for resolving `#name` references.
 *
 * Read from the `tags` column rather than by parsing every note: this runs on
 * each live-preview render, and unlike a note's own tag list it needs no
 * per-note precision — the column is exactly what the last save wrote, and a
 * tag one save behind resolves the same either way. Ancestors are included, so
 * `#infra` is a real reference when only `#infra/ci` is filed anywhere.
 */
export async function listKnownTags(): Promise<Set<string>> {
  const rows = await db.select({ tags: notes.tags }).from(notes);
  return knownTagSet(rows.map((row) => row.tags ?? []));
}

export type SearchCorpusNote = {
  id: string;
  slug: string;
  title: string;
  bodyMd: string;
  tags: string[];
  updatedAt: string;
};

// Full corpus for the client-side search index — the one place bodyMd is
// shipped to the client at all. Frontmatter is stripped since indexing the
// raw YAML would just add search-noise (matches on "title:"/"tags:").
export async function getSearchCorpus(): Promise<SearchCorpusNote[]> {
  const rows = await db
    .select({
      id: notes.id,
      slug: notes.slug,
      title: notes.title,
      contentMd: notes.contentMd,
      updatedAt: notes.updatedAt,
    })
    .from(notes);

  return rows.map((row) => {
    const { data, body } = parseContentMd(row.contentMd);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      tags: resolveNoteTags(data.tags, body),
      updatedAt: row.updatedAt.toISOString(),
      bodyMd: body,
    };
  });
}

export type Backlink = { slug: string; title: string };

export async function getBacklinks(noteId: string): Promise<Backlink[]> {
  return db
    .select({ slug: notes.slug, title: notes.title })
    .from(links)
    .innerJoin(notes, eq(links.fromId, notes.id))
    .where(eq(links.toId, noteId))
    .orderBy(notes.title);
}
