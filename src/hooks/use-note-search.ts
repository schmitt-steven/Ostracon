"use client";

import MiniSearch from "minisearch";
import { useEffect, useMemo, useState } from "react";
import { createSearchIndex, SEARCH_INDEX_OPTIONS, type NoteDoc } from "@/lib/search/build-index";
import { loadCachedIndex, saveIndexCache } from "@/lib/search/indexeddb";

export type NoteOverviewLite = {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  updatedAt: string;
};

export type NoteResult = {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  updatedAt: string;
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
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

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

  const results = useMemo<NoteResult[]>(() => {
    const trimmed = query.trim();
    let matches: NoteResult[];

    if (trimmed.length > 0 && index) {
      matches = index
        .search(trimmed, { prefix: true, fuzzy: 0.2, boost: { title: 2 } })
        .map((hit) => ({
          id: String(hit.id),
          slug: hit.slug as string,
          title: hit.title as string,
          tags: hit.tags as string[],
          updatedAt: hit.updatedAt as string,
        }));
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

    return matches;
  }, [query, selectedTags, index, initialNotes]);

  return {
    query,
    setQuery,
    selectedTags,
    setSelectedTags,
    results,
    ready: index !== null,
  };
}
