import "server-only";
import { desc, eq, isNotNull } from "drizzle-orm";
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
   * Read from the note's frontmatter, not the `tags` column — the column is a
   * derived index for GIN, rewritten on save (see notes/actions). Deriving
   * here also handles pre-tag-bar notes (see [resolveNoteTags]).
   */
  tags: string[];
  /** One line of prose under the title, hashtags removed. */
  snippet: string;
  /**
   * The uploads this note's body points at, deduplicated. Server-side only
   * (`toLite` drops it); derived here because the body is already open.
   */
  imageUrls: string[];
  /** Readable characters written in the note, markup discounted — the
   * "Longest" sort's ranking. */
  textLength: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function listNotesOverview(): Promise<NoteOverview[]> {
  // contentMd is pulled to be read, not just measured: the frontmatter tags
  // and the snippet both come out of it.
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
      // Only our own uploads, not external image URLs.
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
 * Server type -> client type. Field by field, not a spread, so a new
 * NoteOverview field has to be opted into the client payload explicitly
 * (`imageUrls` must not cross).
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
 * The notes an index route shows. `tag` null means all; `untagged` narrows to
 * notes with none; a parent tag matches its children (`#infra` ⊇ `#infra/ci`).
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

export type PinnedNote = { id: string; slug: string; title: string };

/**
 * The pinned notes, most recently pinned first — the arrival order
 * [sortByPinOrder] then reorders. Its own small query rather than a filter
 * over [listNotesOverview], so it can run alongside it. The limit re-asserts
 * the cap the pin action already enforces.
 */
export async function listPinnedNotes(): Promise<PinnedNote[]> {
  return (
    db
      // id for the rail's unpin, slug for the row link.
      .select({ id: notes.id, slug: notes.slug, title: notes.title })
      .from(notes)
      .where(isNotNull(notes.pinnedAt))
      .orderBy(desc(notes.pinnedAt))
      .limit(MAX_PINNED_NOTES)
  );
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
 * Every tag name that exists, for resolving `#name` references. Read from the
 * `tags` column (fast, runs on every live-preview render); precision to the
 * last save is enough here. Ancestors are included.
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
// shipped to the client. Frontmatter is stripped to keep YAML out of the index.
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
