"use client";

import MiniSearch from "minisearch";
import { useCallback, useEffect, useState } from "react";
import {
  createSearchIndex,
  SEARCH_INDEX_OPTIONS,
  type NoteDoc,
} from "@/lib/search/build-index";
import { loadCachedIndex, saveIndexCache } from "@/lib/search/indexeddb";

export type NoteHit = {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  updatedAt: string;
};

// Bumped whenever SEARCH_INDEX_OPTIONS' shape changes, so a stale cached index
// from a previous version of the schema gets rebuilt instead of tripping
// MiniSearch.loadJSON on a mismatched shape.
const SCHEMA_VERSION = 2;

/**
 * The full-text index behind ⌘K's "jump to note" and the index view's own
 * search field.
 *
 * One corpus serves both, and that is the point: ⌘K searches everything from
 * anywhere and mixes notes in with the verbs, while the field on an index
 * searches only what that index is already showing and returns nothing else.
 * They answer different questions off the same fetch.
 *
 * Built lazily: the fetch doesn't start until something actually asks for the
 * index, so opening a note never pays for a search that wasn't run.
 */
export function useSearchIndex(enabled: boolean) {
  // State rather than a ref: search results are read during render, and this
  // project runs the React Compiler, which requires refs stay out of render.
  const [index, setIndex] = useState<MiniSearch<NoteDoc> | null>(null);

  useEffect(() => {
    if (!enabled || index) return;
    let cancelled = false;

    async function sync() {
      try {
        const res = await fetch("/api/notes/search-corpus");
        if (!res.ok) return;
        const corpus = (await res.json()) as NoteDoc[];
        const fingerprint = `v${SCHEMA_VERSION}:${corpus.length}:${corpus.reduce(
          (max, note) => (note.updatedAt > max ? note.updatedAt : max),
          "",
        )}`;

        const cached = await loadCachedIndex().catch(() => undefined);
        if (cached?.fingerprint === fingerprint) {
          try {
            const loaded = MiniSearch.loadJSON<NoteDoc>(
              cached.json,
              SEARCH_INDEX_OPTIONS,
            );
            if (!cancelled) setIndex(loaded);
            return;
          } catch {
            // Corrupt or incompatible cache entry — fall through and rebuild.
          }
        }

        const built = createSearchIndex();
        built.addAll(corpus);
        if (!cancelled) setIndex(built);
        await saveIndexCache(JSON.stringify(built.toJSON()), fingerprint);
      } catch {
        // Offline, or the session expired and the fetch was redirected to the
        // login page and returned HTML — search just stays unavailable.
      }
    }

    void sync();
    return () => {
      cancelled = true;
    };
  }, [enabled, index]);

  // Stable while the index is: callers filter inside a useMemo keyed on this,
  // and a fresh identity every render would make each of those memos a no-op.
  const search = useCallback(
    (query: string, limit = 6): NoteHit[] => {
      const trimmed = query.trim();
      if (!trimmed || !index) return [];
      return index
        .search(trimmed, { prefix: true, fuzzy: 0.2, boost: { title: 2 } })
        .slice(0, limit)
        .map((hit) => ({
          id: String(hit.id),
          slug: hit.slug as string,
          title: hit.title as string,
          tags: (hit.tags as string[]) ?? [],
          updatedAt: hit.updatedAt as string,
        }));
    },
    [index],
  );

  return { search, ready: index !== null };
}
