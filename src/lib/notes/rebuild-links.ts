import "server-only";
import { db } from "@/db/client";
import { links, notes } from "@/db/schema";
import { parseContentMd } from "./frontmatter";
import { extractWikilinkTitles } from "./wikilinks";

/**
 * The whole `links` table, recomputed from the note bodies in one pass.
 *
 * [syncLinksForNote] is the right tool for a save: one note changed, and its
 * row set is rewritten against a database that already holds everything else.
 * It is the wrong tool for an import, twice over.
 *
 * The first reason is cost. It is four or more round trips per note, and an
 * import arrives as a few hundred of them at once — a restore would spend
 * minutes doing it and would not survive a function timeout.
 *
 * The second is correctness, and it is the one that actually forces this. A
 * note linking to `[[Tag design]]` resolves against the notes that exist *at
 * the moment it is synced*, so an import split across several batches has every
 * batch resolving against a collection that isn't finished arriving — and no
 * amount of ordering fixes it, because links run in both directions. A note
 * that was already here, pointing at a title only now being imported, has to
 * gain that link too. Rebuilding from a complete collection is the only version
 * of this that ends up right.
 *
 * Two queries and a chunked insert against a table this app can hold in memory.
 * Not in a transaction — neon-http has none, and the failure mode is the same
 * one [syncLinksForNote] already documents: backlinks stale until the next
 * save, which is a save away from being fixed.
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

  // Titles are not unique, so the oldest note wins — the same deterministic
  // tiebreak [resolveWikilinkTitles] makes, kept identical on purpose so a
  // rebuild can't quietly disagree with an ordinary save.
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
      // A note linking to itself is not a backlink, and the same title written
      // twice in one body is one link.
      if (!target || target.id === row.id || seen.has(target.id)) continue;
      seen.add(target.id);
      pairs.push({ fromId: row.id, toId: target.id });
    }
  }

  await db.delete(links);
  // Chunked because a single statement carrying every link in the collection
  // is a parameter list the driver has an opinion about.
  const CHUNK = 500;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    await db.insert(links).values(pairs.slice(i, i + CHUNK));
  }
}
