"use client";

import MiniSearch from "minisearch";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createSearchIndex, SEARCH_INDEX_OPTIONS, type NoteDoc } from "@/lib/search/build-index";
import {
  getListState,
  getServerListState,
  setListState,
  subscribeListState,
  type SortMode,
} from "@/lib/notes/list-state";
import { loadCachedIndex, saveIndexCache } from "@/lib/search/indexeddb";

export type { SortMode };

export type NoteOverviewLite = {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  textLength: number;
};

/** Search hits are resolved back to overview records, so this is that shape. */
export type NoteResult = NoteOverviewLite;

/**
 * Every tag in use, sorted. The gallery derives this from the same full note
 * list as the list view, not just from the notes that happen to hold an image:
 * a tag selected on one side stays selected when you switch to the other, and
 * a pill that vanished from the row while still filtering would be a mystery.
 */
export function collectTags(notes: NoteOverviewLite[]): string[] {
  const set = new Set<string>();
  for (const note of notes) {
    for (const tag of note.tags) set.add(tag);
  }
  return [...set].sort();
}

// ISO-8601 in a fixed zone sorts correctly as plain strings, so the dates need
// no Date parsing here.
const COMPARATORS: Record<SortMode, (a: NoteResult, b: NoteResult) => number> = {
  modified: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  longest: (a, b) => b.textLength - a.textLength,
};

// Bumped whenever SEARCH_INDEX_OPTIONS' shape changes, so a stale cached
// index from a previous version of the schema gets rebuilt instead of
// tripping MiniSearch.loadJSON on a mismatched shape.
const SCHEMA_VERSION = 1;

function computeFingerprint(notes: NoteOverviewLite[]): string {
  const maxUpdatedAt = notes.reduce(
    (max, n) => (n.updatedAt > max ? n.updatedAt : max),
    "",
  );
  return `v${SCHEMA_VERSION}:${notes.length}:${maxUpdatedAt}`;
}

export function useNoteSearch(initialNotes: NoteOverviewLite[]) {
  // Held in state, not a ref: the search results below need to read this
  // during render, and React (with the compiler active in this project)
  // requires refs to only be read in effects/handlers, never render.
  const [index, setIndex] = useState<MiniSearch<NoteDoc> | null>(null);
  // Survives navigating into a note and back — see `list-state`. React uses
  // the server snapshot for the hydrating render and swaps in the stored one
  // right after, so a restored filter never causes a hydration mismatch.
  const { query, selectedTags, sort } = useSyncExternalStore(
    subscribeListState,
    getListState,
    getServerListState,
  );

  // Each setter reads the live state rather than closing over the render's
  // copy, so two updates in the same tick can't clobber each other.
  const setQuery = useCallback((next: string) => {
    setListState({ ...getListState(), query: next });
  }, []);
  const setSelectedTags = useCallback((next: string[]) => {
    setListState({ ...getListState(), selectedTags: next });
  }, []);
  const setSort = useCallback((next: SortMode) => {
    setListState({ ...getListState(), sort: next });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      const fingerprint = computeFingerprint(initialNotes);
      const cached = await loadCachedIndex().catch(() => undefined);

      if (cached && cached.fingerprint === fingerprint) {
        try {
          const loaded = MiniSearch.loadJSON<NoteDoc>(
            cached.json,
            SEARCH_INDEX_OPTIONS,
          );
          if (!cancelled) setIndex(loaded);
          return;
        } catch {
          // Corrupt/incompatible cache entry — fall through and rebuild.
        }
      }

      try {
        const res = await fetch("/api/notes/search-corpus");
        if (!res.ok) return;
        const corpus = (await res.json()) as NoteDoc[];
        const built = createSearchIndex();
        built.addAll(corpus);
        if (!cancelled) setIndex(built);
        await saveIndexCache(JSON.stringify(built.toJSON()), fingerprint);
      } catch {
        // Offline, or the fetch got redirected to the login page (expired
        // session) and returned HTML instead of JSON — search just stays
        // unavailable until the next successful sync.
      }
    }

    void sync();
    return () => {
      cancelled = true;
    };
    // Re-sync when the note list itself changes shape (create/delete/edit
    // elsewhere), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeFingerprint(initialNotes)]);

  const byId = useMemo(
    () => new Map(initialNotes.map((n) => [n.id, n])),
    [initialNotes],
  );

  const results = useMemo<NoteResult[]>(() => {
    const trimmed = query.trim();
    let matches: NoteResult[];

    if (trimmed.length > 0 && index) {
      // Hits carry only what was indexed, which is not enough to sort by
      // creation date or length — so each hit is resolved back to its overview
      // record. A hit with no record is a note the index hasn't caught up on
      // (deleted since the last sync) and drops out.
      matches = index
        .search(trimmed, { prefix: true, fuzzy: 0.2, boost: { title: 2 } })
        .map((hit) => byId.get(String(hit.id)))
        .filter((note) => note !== undefined);
    } else if (trimmed.length > 0) {
      // Index not ready yet — fall back to a plain substring match over the
      // small overview list rather than showing nothing while it loads.
      const needle = trimmed.toLowerCase();
      matches = initialNotes.filter((n) =>
        n.title.toLowerCase().includes(needle),
      );
    } else {
      matches = initialNotes;
    }

    if (selectedTags.length > 0) {
      matches = matches.filter((n) =>
        selectedTags.some((tag) => n.tags.includes(tag)),
      );
    }

    // Copy before sorting: `matches` is `initialNotes` itself whenever there's
    // no query, and sorting in place would mutate a prop.
    return [...matches].sort(COMPARATORS[sort]);
  }, [query, selectedTags, sort, index, initialNotes, byId]);

  return {
    query,
    setQuery,
    selectedTags,
    setSelectedTags,
    sort,
    setSort,
    results,
    ready: index !== null,
  };
}
