/**
 * The index's sort modes. "Recently edited" is first and so is the default.
 *
 * The four run newest-first, then oldest, then by size: the three time-based
 * ones are variations of one question and belong next to each other, and the
 * one that ignores time follows. "Recently created" is spelled out rather than
 * left as "Created" now that "Oldest" sits under it — on its own it read as a
 * field name, and beside its opposite it has to read as a direction.
 */
export type SortMode = "edited" | "created" | "oldest" | "longest";

export const SORT_MODES: readonly SortMode[] = [
  "edited",
  "created",
  "oldest",
  "longest",
];

export const SORT_LABEL: Record<SortMode, string> = {
  edited: "Recently edited",
  created: "Recently created",
  oldest: "Oldest",
  longest: "Longest",
};
