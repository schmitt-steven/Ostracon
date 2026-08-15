import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { links, notes } from "@/db/schema";
import { parseContentMd } from "./frontmatter";

export type NoteOverview = {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  updatedAt: Date;
};

export async function listNotesOverview(): Promise<NoteOverview[]> {
  return db
    .select({
      id: notes.id,
      slug: notes.slug,
      title: notes.title,
      tags: notes.tags,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .orderBy(desc(notes.updatedAt));
}

export type Note = {
  id: string;
  slug: string;
  title: string;
  contentMd: string;
  tags: string[];
  version: number;
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
      tags: notes.tags,
      updatedAt: notes.updatedAt,
    })
    .from(notes);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    tags: row.tags,
    updatedAt: row.updatedAt.toISOString(),
    bodyMd: parseContentMd(row.contentMd).body,
  }));
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
