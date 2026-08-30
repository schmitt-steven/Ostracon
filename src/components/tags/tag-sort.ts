import type { TagNode } from "@/lib/tags/tree";

/** The tag directory's sort modes; "Recently used" is first and the default,
 * matching the rail's tree. */
export type TagSortMode = "recent" | "az" | "count";

export const TAG_SORT_MODES: readonly TagSortMode[] = ["recent", "az", "count"];

export const TAG_SORT_LABEL: Record<TagSortMode, string> = {
  recent: "Recently used",
  az: "A–Z",
  count: "Most notes",
};

const COMPARATORS: Record<TagSortMode, (a: TagNode, b: TagNode) => number> = {
  // Ties by count then leaf, so the order is total.
  recent: (a, b) =>
    b.lastUsed.localeCompare(a.lastUsed) ||
    b.count - a.count ||
    a.leaf.localeCompare(b.leaf),
  // On the leaf, not the path — the reader can't see the path.
  az: (a, b) => a.leaf.localeCompare(b.leaf),
  count: (a, b) => b.count - a.count || a.leaf.localeCompare(b.leaf),
};

/** The tree in a given order, at every depth — a copy, not an in-place sort. */
export function sortTagTree(nodes: TagNode[], mode: TagSortMode): TagNode[] {
  return [...nodes]
    .sort(COMPARATORS[mode])
    .map((node) =>
      node.children.length === 0
        ? node
        : { ...node, children: sortTagTree(node.children, mode) },
    );
}
