/** The index's sort modes; "Recently edited" is first and the default. */
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
