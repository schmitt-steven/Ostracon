// The main list's query, tag selection and sort, kept outside React.
//
// Opening a note unmounts the list, and coming back mounts a fresh one — the
// router restores the server payload, not client state — so this state has to
// live somewhere that outlives the component. It's exposed as an external
// store (see `useSyncExternalStore`) rather than restored in an effect, which
// keeps the server render and the hydrating client render in agreement.
//
// sessionStorage, not local: a filter is about what you're doing right now,
// and it should be gone when the tab is.

import { RECENCY_MODES, type NoteRecency } from "./recency";

export type SortMode = "modified" | "created" | "oldest" | "longest";

export const SORT_MODES: readonly SortMode[] = [
  "modified",
  "created",
  "oldest",
  "longest",
];

export type ListState = {
  query: string;
  selectedTags: string[];
  /**
   * Which of the automatic tags are selected. Kept apart from `selectedTags`
   * rather than dropped in as magic strings: those are the user's own tag
   * names, and nothing stops one of them from being called "created today".
   */
  selectedRecency: NoteRecency[];
  sort: SortMode;
};

const STORAGE_KEY = "skb:list-state";

// Frozen and shared: `getSnapshot` has to return a stable reference or
// useSyncExternalStore re-renders forever.
const EMPTY: ListState = Object.freeze({
  query: "",
  selectedTags: [],
  selectedRecency: [],
  sort: "modified" as SortMode,
});

// Hand-validated field by field: this is parsed from storage, which a user (or
// an older version of this code) could have written anything into, and a bogus
// `sort` would reach the comparator lookup as undefined and throw mid-sort.
function read(): ListState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY;
    const { query, selectedTags, selectedRecency, sort } =
      parsed as Partial<ListState>;
    return {
      query: typeof query === "string" ? query : "",
      selectedTags: Array.isArray(selectedTags)
        ? selectedTags.filter((t): t is string => typeof t === "string")
        : [],
      selectedRecency: Array.isArray(selectedRecency)
        ? RECENCY_MODES.filter((mode) => selectedRecency.includes(mode))
        : [],
      sort: sort && SORT_MODES.includes(sort) ? sort : "modified",
    };
  } catch {
    // Unparseable entry, or storage blocked outright (Safari private mode) —
    // the list just starts unfiltered.
    return EMPTY;
  }
}

let snapshot: ListState | null = null;
const listeners = new Set<() => void>();

export function getListState(): ListState {
  // Read lazily on first use so this module can be imported on the server.
  snapshot ??= read();
  return snapshot;
}

/** Always the empty state: the server has no session to restore from. */
export function getServerListState(): ListState {
  return EMPTY;
}

export function subscribeListState(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setListState(next: ListState): void {
  snapshot = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked. The in-memory snapshot above still carries the
    // state across navigations within this tab; only a reload forgets it.
  }
  for (const onChange of listeners) onChange();
}
