import { tagLeaf } from "./hue";
import { tagAncestry } from "./parse";

export type TagNode = {
  /** Full path, e.g. `infra/ci`. What the route and the hue are keyed on. */
  name: string;
  /** Last segment — what the row prints, since the parent is the row above. */
  leaf: string;
  /** Notes carrying this tag or any tag beneath it — matching the route it
   * opens. */
  count: number;
  /** Most recent `updatedAt` among those notes — what the sidebar sorts on. */
  lastUsed: string;
  children: TagNode[];
};

type Counted = { count: number; lastUsed: string };

export type TaggedNote = { tags: string[]; updatedAt: string };

/** The sidebar's tag tree, sorted by recent use at every level (not
 * alphabetical). */
export function buildTagTree(notes: TaggedNote[]): TagNode[] {
  // Every ancestor is counted — `#infra/ci` alone still creates an `#infra` row.
  const stats = new Map<string, Counted>();
  for (const note of notes) {
    const reached = new Set<string>();
    for (const tag of note.tags) {
      for (const ancestor of tagAncestry(tag)) reached.add(ancestor);
    }
    // Per note — `#infra/ci` + `#infra/deploys` counts once against `#infra`.
    for (const name of reached) {
      const current = stats.get(name);
      if (!current) {
        stats.set(name, { count: 1, lastUsed: note.updatedAt });
      } else {
        current.count++;
        if (note.updatedAt > current.lastUsed)
          current.lastUsed = note.updatedAt;
      }
    }
  }

  const nodes = new Map<string, TagNode>();
  for (const [name, { count, lastUsed }] of stats) {
    nodes.set(name, {
      name,
      leaf: tagLeaf(name),
      count,
      lastUsed,
      children: [],
    });
  }

  const roots: TagNode[] = [];
  for (const node of nodes.values()) {
    const slash = node.name.lastIndexOf("/");
    const parent =
      slash === -1 ? undefined : nodes.get(node.name.slice(0, slash));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Most recent first; ties broken by count then name for a total order.
  const byRecency = (a: TagNode, b: TagNode) =>
    b.lastUsed.localeCompare(a.lastUsed) ||
    b.count - a.count ||
    a.name.localeCompare(b.name);

  const sortDeep = (list: TagNode[]) => {
    list.sort(byRecency);
    for (const node of list) sortDeep(node.children);
  };
  sortDeep(roots);

  return roots;
}

/** Flattens the tree back to a list, parents before their children. */
export function flattenTree(nodes: TagNode[]): TagNode[] {
  const out: TagNode[] = [];
  const walk = (list: TagNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
