"use client";

// "Ask to log out", held outside React (like lib/command/palette-state) so the
// ⌘K row and [LogOutPrompt] can talk without a path between them. An event,
// not a value — subscribers are called, there's nothing to read or reset.

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
