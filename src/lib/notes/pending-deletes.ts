// Notes the user has confirmed deleting, from the click until the revalidated
// list comes back without them.
//
// The list hides these rows and the heading leaves them out of its count, and
// the two have to agree within a single commit — the view transition snapshots
// the page once, so a heading that updated a beat later would animate on its
// own instead of as part of the same motion. They're in different subtrees
// (the heading is the page's, the list is its own component), so the shared
// state lives out here, in the same external-store shape as `list-state`.
//
// In memory only: a pending delete is resolved within the same interaction,
// and one that somehow outlived a reload would hide a note that still exists.

// Frozen and shared: `getSnapshot` has to return a stable reference or
// useSyncExternalStore re-renders forever.
const EMPTY: readonly string[] = Object.freeze([]);

let snapshot: readonly string[] = EMPTY;
const listeners = new Set<() => void>();

export function getPendingDeletes(): readonly string[] {
  return snapshot;
}

/** Always empty: a server render has no interaction in flight. */
export function getServerPendingDeletes(): readonly string[] {
  return EMPTY;
}

export function subscribePendingDeletes(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function set(next: readonly string[]): void {
  snapshot = next.length === 0 ? EMPTY : next;
  for (const onChange of listeners) onChange();
}

export function addPendingDelete(id: string): void {
  if (snapshot.includes(id)) return;
  set([...snapshot, id]);
}

/** Undoes `addPendingDelete` when the deletion turns out to have failed. */
export function clearPendingDelete(id: string): void {
  set(snapshot.filter((pending) => pending !== id));
}
