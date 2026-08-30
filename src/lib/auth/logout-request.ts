"use client";

// "Ask to log out", held outside React — the same arrangement as the palette's
// own open state (lib/command/palette-state) and the import picker
// (lib/notes/import-request), and for the same reason: the row that asks is in
// ⌘K, mounted in the shell above the router, and the dialog that answers is
// [LogOutPrompt] beside it. Neither has a path to the other.
//
// An event rather than a value, so there is nothing to read and nothing to
// reset: subscribers are called, and a prompt already on screen stays on it.

const listeners = new Set<() => void>();

/** Asks for the log-out confirmation. */
export function requestLogout(): void {
  for (const listener of listeners) listener();
}

export function subscribeLogout(onRequest: () => void): () => void {
  listeners.add(onRequest);
  return () => {
    listeners.delete(onRequest);
  };
}
