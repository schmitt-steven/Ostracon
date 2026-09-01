"use client";

import MiniSearch from "minisearch";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSearchIndex,
  SEARCH_INDEX_OPTIONS,
  type NoteDoc,
} from "@/lib/search/build-index";
import type { SearchMenuScope } from "@/lib/search-menu/scope";
import { loadCachedIndex, saveIndexCache } from "@/lib/search/indexeddb";
import { countImages } from "@/lib/notes/text-length";
import { byReason, reasonFrom, type MatchReason } from "@/lib/search/results";
import { plainText, tagAncestry, tagMatches } from "@/lib/tags/parse";

export type NoteHit = {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  updatedAt: string;
  /** The note's prose with its markup taken off — excerpts and preview. */
  text: string;
  /** The body with markup left on, whitespace collapsed — what the index
   * searches, and the snippet's fallback source. See [snippet]. */
  raw: string;
  /** How many images it embeds. The preview says so when there are any. */
  images: number;
  /** The index terms this hit matched (not the query terms — a prefix search
   * for `deploy` matches the stored `deployments`). */
  terms: string[];
  reason: MatchReason;
};

/** Shared so an un-run search doesn't hand back a new object every render. */
const EMPTY_SEARCH = Object.freeze({ hits: [] as NoteHit[], total: 0 });

/**
 * Whether a note falls inside a scope. `subtags` is the search menu's toggle
 * for whether `#infra` includes `#infra/ci`. The `tags` scope lets everything
 * through — it orders the list, doesn't narrow it (see [SearchMenuScope]).
 */
function inScope(
  tags: readonly string[],
  scope: SearchMenuScope | null,
  subtags: boolean,
): boolean {
  if (!scope) return true;
  if (scope.kind === "untagged") return tags.length === 0;
  if (scope.kind === "tags") return true;
  return subtags
    ? tags.some((name) => tagMatches(name, scope.name))
    : tags.includes(scope.name);
}

/**
 * Typo tolerance by term length: fuzzy only from 6 characters up, where an
 * edit distance of one is a small neighbourhood (`vercell` → `#vercel`).
 * Shorter words rely on prefix matching, which is enough (`next` → `nextjs`).
 */
const FUZZY = (term: string) => (term.length >= 6 ? 0.2 : false);

/** Markup left on, whitespace flattened — see [NoteHit.raw]. */
function collapse(bodyMd: string): string {
  return bodyMd.replace(/\s+/g, " ").trim();
}

// Bumped when SEARCH_INDEX_OPTIONS' shape changes, so a stale cached index is
// rebuilt rather than tripping MiniSearch.loadJSON. 3 added [stemTerm].
const SCHEMA_VERSION = 3;

/**
 * The full-text index behind ⌘K's "jump to note" and the index views' search
 * fields. One corpus, two questions (everything, vs. only this index's notes),
 * off one lazily-triggered fetch.
 */
export function useSearchIndex(enabled: boolean) {
  // State, not a ref — results are read during render, and the React Compiler
  // keeps refs out of render.
  const [index, setIndex] = useState<MiniSearch<NoteDoc> | null>(null);
  // Kept alongside the index for the query-less questions ("six most recent"),
  // answered from the documents rather than searched.
  const [corpus, setCorpus] = useState<NoteDoc[] | null>(null);

  useEffect(() => {
    if (!enabled || index) return;
    let cancelled = false;

    async function sync() {
      try {
        const res = await fetch("/api/notes/search-corpus");
        if (!res.ok) return;
        const corpus = (await res.json()) as NoteDoc[];
        if (!cancelled) setCorpus(corpus);
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
        // Offline or session expired — search stays unavailable.
      }
    }

    void sync();
    return () => {
      cancelled = true;
    };
  }, [enabled, index]);

  // Bodies by id — `bodyMd` isn't a stored MiniSearch field (too large for the
  // IndexedDB cache), so it's looked up from the in-memory corpus.
  const bodies = useMemo(
    () => new Map((corpus ?? []).map((note) => [note.id, note.bodyMd])),
    [corpus],
  );

  // Stable while the index is — callers memo on it.
  const search = useCallback(
    (
      query: string,
      scope: SearchMenuScope | null = null,
      limit = 6,
      subtags = true,
    ): { hits: NoteHit[]; total: number } => {
      const trimmed = query.trim();
      if (!trimmed || !index) return EMPTY_SEARCH;

      const hits = index
        .search(trimmed, { prefix: true, fuzzy: FUZZY, boost: { title: 2 } })
        // Narrowed here, not asked-for-six — the global top six may contain
        // none of the scope's.
        .filter((hit) => inScope((hit.tags as string[]) ?? [], scope, subtags));

      const results = hits.slice(0, limit).map((hit): NoteHit => {
        const tags = (hit.tags as string[]) ?? [];
        const bodyMd = bodies.get(String(hit.id)) ?? "";
        // `hit.match` already maps each term to the fields it matched in.
        const fields = new Set(Object.values(hit.match).flat());
        return {
          id: String(hit.id),
          slug: hit.slug as string,
          title: hit.title as string,
          tags,
          updatedAt: hit.updatedAt as string,
          text: plainText(bodyMd),
          raw: collapse(bodyMd),
          images: countImages(bodyMd),
          terms: hit.terms,
          reason: reasonFrom(fields, tags, hit.terms),
        };
      });

      // `total` is everything the scope let through, not the slice shown.
      return { hits: byReason(results), total: hits.length };
    },
    [index, bodies],
  );

  /**
   * The most recently updated notes in a scope — what the search menu shows
   * before a query exists.
   */
  const recent = useCallback(
    (
      limit: number,
      scope: SearchMenuScope | null = null,
      subtags = true,
    ): NoteHit[] => {
      if (!corpus) return [];
      // Filtered before sorting.
      return corpus
        .filter((note) => inScope(note.tags ?? [], scope, subtags))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map((note) => ({
          id: note.id,
          slug: note.slug,
          title: note.title,
          tags: note.tags ?? [],
          updatedAt: note.updatedAt,
          text: plainText(note.bodyMd),
          raw: collapse(note.bodyMd),
          images: countImages(note.bodyMd),
          terms: [],
          reason: { kind: "recent" as const },
        }));
    },
    [corpus],
  );

  /**
   * Per-tag note count and last-used date, sub-tags counted in, built from the
   * ancestry of every tag in use so `#infra` has a count even when only
   * `#infra/ci` is filed. One pass — the search menu's tag rows report the
   * count and default-sort on the date.
   */
  const { tagCounts, tagLastUsed } = useMemo(() => {
    const counts = new Map<string, number>();
    const lastUsed = new Map<string, string>();
    for (const note of corpus ?? []) {
      const seen = new Set<string>();
      for (const tag of note.tags ?? []) {
        for (const ancestor of tagAncestry(tag)) seen.add(ancestor);
      }
      for (const tag of seen) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
        const at = lastUsed.get(tag);
        if (at === undefined || note.updatedAt > at) {
          lastUsed.set(tag, note.updatedAt);
        }
      }
    }
    return { tagCounts: counts, tagLastUsed: lastUsed };
  }, [corpus]);

  return { search, recent, tagCounts, tagLastUsed, ready: index !== null };
}
