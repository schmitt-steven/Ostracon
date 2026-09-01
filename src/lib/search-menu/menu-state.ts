"use client";

// Whether the search menu is open, held outside React so the scattered
// things that open it (⌘K, header hints, the touch bottom bar) need no path
// down to it.

let open = false;
// Latched on first open, never cleared — tells the lazy search-corpus fetch
// it's worth keeping across a close/reopen.
let everOpened = false;
const listeners = new Set<() => void>();

export function getSearchMenuOpen(): boolean {
  return open;
}

export function getSearchMenuEverOpened(): boolean {
  return everOpened;
}

/** Never on the server — nothing has been pressed yet. */
export function getServerSearchMenuEverOpened(): boolean {
  return false;
}

/** Always closed on the server; nothing has been pressed yet. */
export function getServerSearchMenuOpen(): boolean {
  return false;
}

export function subscribeSearchMenuOpen(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setSearchMenuOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  if (next) everOpened = true;
  for (const listener of listeners) listener();
}
