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

/** The timestamp a row shows: the one it's ranked by, so the order is legible.
 * "Longest" doesn't rank by time and keeps the edit date. */
export const SORT_DATE_FIELD: Record<SortMode, "createdAt" | "updatedAt"> = {
  edited: "updatedAt",
  created: "createdAt",
  oldest: "createdAt",
  longest: "updatedAt",
};
