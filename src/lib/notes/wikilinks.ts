import "server-only";
import { eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { links, notes } from "@/db/schema";

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function extractWikilinkTitles(bodyMd: string): string[] {
  const titles = new Set<string>();
  for (const match of bodyMd.matchAll(WIKILINK_RE)) {
    const title = match[1]?.trim();
    if (title) titles.add(title);
  }
  return [...titles];
}

/**
 * Resolves wikilink titles to slugs. When multiple notes share a title
 * (no uniqueness constraint on title), the oldest note wins — deterministic,
 * documented tiebreak rather than an arbitrary one.
 */
export async function resolveWikilinkTitles(
  titles: string[],
): Promise<Map<string, string>> {
  if (titles.length === 0) return new Map();
  const normalized = [...new Set(titles.map((t) => t.toLowerCase()))];

  const rows = await db
    .select({
      slug: notes.slug,
      title: notes.title,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .where(inArray(sql`lower(${notes.title})`, normalized));

  const oldestByTitle = new Map<string, { slug: string; createdAt: Date }>();
  for (const row of rows) {
    const key = row.title.toLowerCase();
    const existing = oldestByTitle.get(key);
    if (!existing || row.createdAt < existing.createdAt) {
      oldestByTitle.set(key, { slug: row.slug, createdAt: row.createdAt });
    }
  }

  const result = new Map<string, string>();
  for (const [title, v] of oldestByTitle) result.set(title, v.slug);
  return result;
}

/**
 * Slugs of every note linked with this one in either direction: the notes it
 * points at (whose backlink panels list it) and the notes pointing at it
 * (whose wikilinks to it are about to go dead). Deleting a note changes how
 * all of those render, so the caller revalidates them.
 */
export async function linkedSlugs(noteId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: notes.slug })
    .from(links)
    .innerJoin(
      notes,
      // The note at whichever end of the row isn't the one being asked about.
      sql`${notes.id} = case when ${links.fromId} = ${noteId} then ${links.toId} else ${links.fromId} end`,
    )
    .where(or(eq(links.fromId, noteId), eq(links.toId, noteId)));

  return [...new Set(rows.map((r) => r.slug))];
}

/**
 * Recomputes the `links` rows for a note from its current body: delete-then-insert
 * rather than diffing (simpler, still fine at this app's scale). Not run inside a
 * transaction — neon-http has no transaction support; a crash between the note
 * write and this call just leaves backlinks stale until the next save.
 * Returns the slugs of every note whose backlinks may have changed (old + new
 * targets), so the caller can revalidate those paths.
 */
export async function syncLinksForNote(
  noteId: string,
  bodyMd: string,
): Promise<string[]> {
  const titles = extractWikilinkTitles(bodyMd);
  const resolved = await resolveWikilinkTitles(titles);
  const targetSlugs = [...new Set(resolved.values())];

  const targets =
    targetSlugs.length > 0
      ? await db
          .select({ id: notes.id, slug: notes.slug })
          .from(notes)
          .where(inArray(notes.slug, targetSlugs))
      : [];
  const newTargetIds = [
    ...new Set(targets.map((t) => t.id).filter((id) => id !== noteId)),
  ];

  const previousTargets = await db
    .select({ slug: notes.slug })
    .from(notes)
    .innerJoin(links, eq(links.toId, notes.id))
    .where(eq(links.fromId, noteId));

  await db.delete(links).where(eq(links.fromId, noteId));
  if (newTargetIds.length > 0) {
    await db
      .insert(links)
      .values(newTargetIds.map((toId) => ({ fromId: noteId, toId })));
  }

  const affected = new Set<string>();
  for (const t of targets) affected.add(t.slug);
  for (const t of previousTargets) affected.add(t.slug);
  return [...affected];
}
