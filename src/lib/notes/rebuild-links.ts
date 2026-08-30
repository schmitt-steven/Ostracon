import "server-only";
import { db } from "@/db/client";
import { links, notes } from "@/db/schema";
import { parseContentMd } from "./frontmatter";
import { extractWikilinkTitles } from "./wikilinks";

/**
 * Recomputes the whole `links` table from note bodies in one pass. Used for
 * imports, where per-note [syncLinksForNote] is both too many round trips and
 * wrong: links run both directions, so every note must resolve against the
 * complete collection. Not in a transaction (neon-http has none) — on failure,
 * backlinks are stale until the next save.
 */
export async function rebuildAllLinks(): Promise<void> {
  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      contentMd: notes.contentMd,
      createdAt: notes.createdAt,
    })
    .from(notes);

  // Titles aren't unique; oldest note wins — must match [resolveWikilinkTitles].
  const idByTitle = new Map<string, { id: string; createdAt: Date }>();
  for (const row of rows) {
    const key = row.title.toLowerCase();
    const existing = idByTitle.get(key);
    if (!existing || row.createdAt < existing.createdAt) {
      idByTitle.set(key, { id: row.id, createdAt: row.createdAt });
    }
  }

  const pairs: { fromId: string; toId: string }[] = [];
  for (const row of rows) {
    const { body } = parseContentMd(row.contentMd);
    const seen = new Set<string>();
    for (const title of extractWikilinkTitles(body)) {
      const target = idByTitle.get(title.toLowerCase());
      // No self-links; a title repeated in one body is one link.
      if (!target || target.id === row.id || seen.has(target.id)) continue;
      seen.add(target.id);
      pairs.push({ fromId: row.id, toId: target.id });
    }
  }

  await db.delete(links);
  // Chunked to keep the parameter list within driver limits.
  const CHUNK = 500;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    await db.insert(links).values(pairs.slice(i, i + CHUNK));
  }
}
