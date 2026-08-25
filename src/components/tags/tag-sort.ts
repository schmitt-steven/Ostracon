import type { TagNode } from "@/lib/tags/tree";

/**
 * The tag directory's sort modes. "Recently used" is first and so is the
 * default, as it is in the index and the gallery — the app has one answer to
 * "what should I be looking at first" and it is the same one everywhere.
 *
 * It is also what the rail's tree did, so the directory opens showing the tags
 * in the order the rows it replaced were in: what you were last in, at the top,
 * where your eye already goes. Alphabetical is the other real errand here —
 * arriving with a name and wanting to know where it sits — and it is one press
 * away rather than the thing you have to read past every visit.
 */
export type TagSortMode = "recent" | "az" | "count";

export const TAG_SORT_MODES: readonly TagSortMode[] = ["recent", "az", "count"];

export const TAG_SORT_LABEL: Record<TagSortMode, string> = {
  recent: "Recently used",
  az: "A–Z",
  count: "Most notes",
};

const COMPARATORS: Record<TagSortMode, (a: TagNode, b: TagNode) => number> = {
  // ISO-8601 in a fixed zone sorts correctly as plain strings. Ties broken by
  // count, then name, so every mode's order is total — two equal rows can't
  // swap places between renders.
  recent: (a, b) =>
    b.lastUsed.localeCompare(a.lastUsed) ||
    b.count - a.count ||
    a.leaf.localeCompare(b.leaf),
  // On the leaf, not the full path: the rows under `#infra` print `ci` and
  // `deploys`, so ordering them by `infra/ci` would be sorting on characters
  // the reader can't see. At the top level the two are the same string.
  az: (a, b) => a.leaf.localeCompare(b.leaf),
  count: (a, b) => b.count - a.count || a.leaf.localeCompare(b.leaf),
};

/**
 * The tree in a given order, at every depth. A copy rather than a sort in
 * place: the tree comes down from the server component and is React's, not
 * ours, and nodes with no children are handed back as they are.
 */
export function sortTagTree(nodes: TagNode[], mode: TagSortMode): TagNode[] {
  return [...nodes]
    .sort(COMPARATORS[mode])
    .map((node) =>
      node.children.length === 0
        ? node
        : { ...node, children: sortTagTree(node.children, mode) },
    );
}
