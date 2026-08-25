"use client";

import MiniSearch from "minisearch";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSearchIndex,
  SEARCH_INDEX_OPTIONS,
  type NoteDoc,
} from "@/lib/search/build-index";
import type { PaletteScope } from "@/lib/command/scope";
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
  /**
   * The same body with its markup left on, whitespace collapsed.
   *
   * The index searches this, `text` is what gets rendered, and the two do not
   * agree: a term inside a link's URL or a fenced block matches here and is
   * gone from there. It is the snippet's second place to look, so a row that
   * matched can always show *what* matched. See [snippet].
   */
  raw: string;
  /** How many images it embeds. The preview says so when there are any. */
  images: number;
  /**
   * The index terms this hit matched, for highlighting. Not the query terms:
   * a prefix search for `deploy` matches the stored term `deployments`, and
   * highlighting the query would mark four letters of a word and stop.
   */
  terms: string[];
  reason: MatchReason;
};

/** Shared so an un-run search doesn't hand back a new object every render. */
const EMPTY_SEARCH = Object.freeze({ hits: [] as NoteHit[], total: 0 });

/**
 * Whether a note falls inside a scope.
 *
 * `subtags` is the palette's toggle, not a default worth arguing about: under
 * `#infra` you usually mean `#infra/ci` too, right up until you mean the six
 * notes filed at `#infra` itself and nothing else.
 *
 * The tag-directory scope lets every note through, and that is the whole of
 * what it does to them: it orders the palette's list rather than narrowing it
 * — see [PaletteScope].
 */
function inScope(
  tags: readonly string[],
  scope: PaletteScope | null,
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
 * How much of a typo the search forgives, by term length.
 *
 * `fuzzy: 0.2` alone is an edit distance of one from three characters up
 * (`Math.round(length * 0.2)`), and one edit into a four-letter word is a
 * quarter of it: `next` reaches `text` and `net`, so a search for Next.js
 * comes back with a to-do list. That noise does not stay politely at the
 * bottom either — a *fuzzy title* match lands in the title band of
 * [byReason], which sorts above every exact body match no matter how many
 * times the word actually appears there.
 *
 * Six characters up, an edit distance of one is a small neighbourhood and
 * mistyping is plausible — `vercell` still finds `#vercel`. Below that the
 * word is quick to retype and prefix matching still covers the useful half:
 * `next` finds `nextjs` without help from fuzzy.
 */
const FUZZY = (term: string) => (term.length >= 6 ? 0.2 : false);

/** Markup left on, whitespace flattened — see [NoteHit.raw]. */
function collapse(bodyMd: string): string {
  return bodyMd.replace(/\s+/g, " ").trim();
}

// Bumped whenever SEARCH_INDEX_OPTIONS' shape changes, so a stale cached index
// from a previous version of the schema gets rebuilt instead of tripping
// MiniSearch.loadJSON on a mismatched shape. 3 added [stemTerm], which changes
// every term in the index — a cache from 2 would be searched with a processTerm
// its own contents were never folded by, and half the queries would silently
// miss.
const SCHEMA_VERSION = 3;

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
  // The corpus is kept alongside the index because MiniSearch answers
  // questions that have a query in them and nothing else. "The six most
  // recently touched notes" has no query, so it is answered from the documents
  // themselves — the same fetch, sorted rather than searched.
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
        // Offline, or the session expired and the fetch was redirected to the
        // login page and returned HTML — search just stays unavailable.
      }
    }

    void sync();
    return () => {
      cancelled = true;
    };
  }, [enabled, index]);

  /**
   * Bodies by id.
   *
   * MiniSearch stores the fields it was told to store, and `bodyMd` is
   * deliberately not one of them — it's the largest field by far and the
   * stored copy is what gets serialised into the IndexedDB cache. The corpus
   * is already in memory, so the body is looked up beside the hit instead.
   */
  const bodies = useMemo(
    () => new Map((corpus ?? []).map((note) => [note.id, note.bodyMd])),
    [corpus],
  );

  // Stable while the index is: callers filter inside a useMemo keyed on this,
  // and a fresh identity every render would make each of those memos a no-op.
  const search = useCallback(
    (
      query: string,
      scope: PaletteScope | null = null,
      limit = 6,
      subtags = true,
    ): { hits: NoteHit[]; total: number } => {
      const trimmed = query.trim();
      if (!trimmed || !index) return EMPTY_SEARCH;

      const hits = index
        .search(trimmed, { prefix: true, fuzzy: FUZZY, boost: { title: 2 } })
        // Scoped, the index is asked for everything and narrowed here rather
        // than asked for six: the top six overall may contain none of the
        // scope's, and a scoped search that came back empty while matches
        // existed would be the palette lying about the collection.
        .filter((hit) => inScope((hit.tags as string[]) ?? [], scope, subtags));

      const results = hits.slice(0, limit).map((hit): NoteHit => {
        const tags = (hit.tags as string[]) ?? [];
        const bodyMd = bodies.get(String(hit.id)) ?? "";
        // `match` maps each matched term to the fields it was found in, which
        // is the whole match reason already computed — no second pass over the
        // text to work out why this row is here.
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

      // `total` counts everything the scope let through, not the slice that
      // fits. The header says "23 results" over six rows because the honest
      // answer to "how much is there" is not "six".
      return { hits: byReason(results), total: hits.length };
    },
    [index, bodies],
  );

  /**
   * The most recently updated notes, newest first, inside a scope.
   *
   * This is what the palette shows before a query exists — on open, and the
   * moment a tag is narrowed to. The reason line on these rows is the note's
   * opening prose rather than an explanation, because "you edited it on
   * Tuesday" is the whole of why it's here and the date column says that.
   */
  const recent = useCallback(
    (
      limit: number,
      scope: PaletteScope | null = null,
      subtags = true,
    ): NoteHit[] => {
      if (!corpus) return [];
      // Filtered before sorting: ordering the whole corpus to take six off the
      // top of a slice of it is work the scope has already ruled out.
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
   * How many notes sit under each tag, and when it was last written in — its
   * sub-tags counted in for both.
   *
   * Built from the ancestry of every tag in use rather than from a tag list
   * passed in, so `#infra` has a count even in a collection where nothing is
   * tagged `#infra` directly and everything is under `#infra/ci`.
   *
   * One pass for the pair of them because they are the same walk: the count is
   * what the palette's tag rows report, and the date is the order they arrive
   * in when there is no query to rank them by — the same default the tag
   * directory sorts on, for the same reason. ISO-8601 in a fixed zone compares
   * correctly as plain strings.
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
