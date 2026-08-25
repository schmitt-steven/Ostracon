"use client";

// "Open the file picker", held outside React — the same arrangement the
// palette's own open state uses (see lib/command/palette-state) and for the
// same reason: the thing that asks is a row in ⌘K, which is mounted in the
// shell above the router, and the thing that answers is the hidden input in
// [NoteImport] beside it. Neither has a path to the other.
//
// An event rather than a value, so there is nothing to read and nothing to
// reset: subscribers are called, and a picker that was already open stays open.

const listeners = new Set<() => void>();

/**
 * Asks for the import picker. Must be called from a real user gesture —
 * browsers only open a file dialog from one, and the listener clicks the input
 * synchronously so the palette's Return keeps that gesture intact.
 */
export function requestNoteImport(): void {
  for (const listener of listeners) listener();
}

export function subscribeNoteImport(onRequest: () => void): () => void {
  listeners.add(onRequest);
  return () => {
    listeners.delete(onRequest);
  };
}
