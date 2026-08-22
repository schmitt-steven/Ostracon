import { tagLeaf } from "./hue";
import { tagAncestry } from "./parse";

export type TagNode = {
  /** Full path, e.g. `infra/ci`. What the route and the hue are keyed on. */
  name: string;
  /** Last segment — what the row prints, since the parent is the row above. */
  leaf: string;
  /**
   * Notes carrying this tag *or any tag beneath it*. `#infra` counting only
   * the notes tagged exactly `#infra` would show a number that shrinks the
   * moment you click it, because the route it opens matches the children too.
   */
  count: number;
  /** Most recent `updatedAt` among those notes — what the rail sorts on. */
  lastUsed: string;
  children: TagNode[];
};

type Counted = { count: number; lastUsed: string };

export type TaggedNote = { tags: string[]; updatedAt: string };

/**
 * The rail's tag tree.
 *
 * Sorted by recent use at every level, never alphabetically. Alphabetical
 * order only helps someone who already knows the tag's name — and someone who
 * knows the name types it into the filter instead of hunting the list. What a
 * rail full of tags is actually for is finding the thing you were just in.
 */
export function buildTagTree(notes: TaggedNote[]): TagNode[] {
  // Every ancestor is counted, not just the tags as written: a note tagged
  // only `#infra/ci` still has to make `#infra` exist as a row to nest under.
  const stats = new Map<string, Counted>();
  for (const note of notes) {
    const reached = new Set<string>();
    for (const tag of note.tags) {
      for (const ancestor of tagAncestry(tag)) reached.add(ancestor);
    }
    // Per note, so a note tagged `#infra/ci` and `#infra/deploys` counts once
    // against `#infra` rather than twice.
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

  // Most recently used first; ties broken by count, then name, so the order is
  // total and a re-render can't shuffle two equal rows past each other.
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
