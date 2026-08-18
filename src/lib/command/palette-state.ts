"use client";

// Whether the command palette is open, held outside React.
//
// The palette is mounted in the shell, but the things that open it are
// scattered — ⌘K from anywhere, the hint in each view's header, the bottom bar
// on touch. A store means none of them need a path down to it.

let open = false;
// Latched the first time the palette is opened, and never cleared. The search
// corpus is fetched lazily, and this is what says "it's worth having now" —
// without it, closing the palette would abandon a fetch already in flight and
// start it again on the next ⌘K.
let everOpened = false;
const listeners = new Set<() => void>();

export function getPaletteOpen(): boolean {
  return open;
}

export function getPaletteEverOpened(): boolean {
  return everOpened;
}

/** Never on the server — nothing has been pressed yet. */
export function getServerPaletteEverOpened(): boolean {
  return false;
}

/** Always closed on the server; nothing has been pressed yet. */
export function getServerPaletteOpen(): boolean {
  return false;
}

export function subscribePaletteOpen(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setPaletteOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  if (next) everOpened = true;
  for (const listener of listeners) listener();
}
