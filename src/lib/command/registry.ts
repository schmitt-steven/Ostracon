"use client";

// Commands the palette offers that only exist while a particular view is on
// screen — the editor's mode switches and "Suggest tags", today.
//
// A registry rather than props or context because the palette is mounted in
// the shell, above the router, and the editor is several levels below it. The
// alternative is threading a callback through every layout between them, which
// coupleseach one to a feature none of them care about.

export type Command = {
  id: string;
  label: string;
  /** Groups the palette's list. Sentence case, like everything else. */
  group: string;
  /**
   * The muted line under the label in the palette: what this does, in a
   * fragment. Every row there states why it is on screen, and a command with
   * nothing to say falls back to its group — "Editor" is a true answer even
   * when it isn't a good one.
   */
  detail?: string;
  /** Extra words to match against — never shown. */
  keywords?: string;
  /** Shown right-aligned, in mono. */
  shortcut?: string;
  run: () => void;
};

let contextual: Command[] = [];
const listeners = new Set<() => void>();

export function getContextualCommands(): Command[] {
  return contextual;
}

/** Empty on the server — nothing has mounted to register anything yet. */
export function getServerContextualCommands(): Command[] {
  return EMPTY;
}

// Frozen and shared: useSyncExternalStore re-renders forever if the server
// snapshot isn't referentially stable.
const EMPTY: Command[] = Object.freeze([]) as unknown as Command[];

export function subscribeContextualCommands(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * Publishes a view's commands and returns the teardown. Whatever registered
 * last wins outright — there is only ever one view in the main pane, so
 * merging two sets would mean offering commands for a screen that has already
 * been navigated away from.
 */
export function registerCommands(commands: Command[]): () => void {
  contextual = commands;
  for (const listener of listeners) listener();
  return () => {
    // Only clear if nothing else has registered since; on a navigation the new
    // view mounts before the old one's cleanup runs.
    if (contextual !== commands) return;
    contextual = EMPTY;
    for (const listener of listeners) listener();
  };
}
