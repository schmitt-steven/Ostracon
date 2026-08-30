"use client";

// "Open the file picker", held outside React (like lib/command/palette-state)
// so the ⌘K row and [NoteImport]'s hidden input can talk without a path
// between them. An event, not a value.

const listeners = new Set<() => void>();

/**
 * Asks for the import picker. Must be called from a real user gesture — the
 * listener clicks the input synchronously to keep it intact.
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
