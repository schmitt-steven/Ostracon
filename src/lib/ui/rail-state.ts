"use client";

// Whether the desktop rail is showing, held outside React and remembered
// across sessions.
//
// localStorage rather than sessionStorage, for the same reason the tag
// preferences use it: hiding the rail is a standing arrangement of the
// workspace — someone who works with it closed wants it closed tomorrow too,
// not just for the rest of this tab's life.
//
// Only the ≥1000px layout reads this. Below that the rail is an overlay
// drawer that is always closed at rest, and a remembered "open" there would
// mean arriving at a screen covered by a panel nobody asked for.

const STORAGE_KEY = "skb:rail-open";

let snapshot: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    // Anything other than an explicit "0" means open, so a storage value
    // written by an older version — or by hand — fails towards the rail being
    // visible rather than towards a shell with no navigation in it.
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function getRailOpen(): boolean {
  snapshot ??= read();
  return snapshot;
}

/**
 * Always open. The server can't read storage, so it renders the rail and the
 * stored "closed" swaps in immediately after hydration — the same trade the
 * tag preferences make, and the right way round: a rail that appears and then
 * folds away is a far smaller thing to see than a shell that starts empty and
 * then grows a sidebar.
 */
export function getServerRailOpen(): boolean {
  return true;
}

export function subscribeRailOpen(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setRailOpen(next: boolean): void {
  if (getRailOpen() === next) return;
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Storage full or blocked — the in-memory snapshot still holds for this
    // session; only a reload forgets it.
  }
  for (const listener of listeners) listener();
}

export function toggleRailOpen(): void {
  setRailOpen(!getRailOpen());
}
