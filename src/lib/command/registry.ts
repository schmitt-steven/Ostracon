"use client";

// Commands the palette offers only while a particular view is on screen (the
// editor's mode switches and "Suggest tags", today). A registry, not props or
// context, because the palette sits in the shell above the router and the
// editor is levels below it.

import type { ActionIcon } from "@/components/command/types";

export type Command = {
  id: string;
  label: string;
  /** Groups the palette's list. Sentence case, like everything else. */
  group: string;
  /** The muted line under the label; falls back to the group name. */
  detail?: string;
  /** Extra words to match against — never shown. */
  keywords?: string;
  /** The glyph beside the row; defaults to a generic "runs something" arrow. */
  icon?: ActionIcon;
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
 * Publishes a view's commands and returns the teardown. Last registration
 * wins — there's only ever one view in the main pane.
 */
export function registerCommands(commands: Command[]): () => void {
  contextual = commands;
  for (const listener of listeners) listener();
  return () => {
    // Only clear if nothing registered since (the new view mounts before this
    // runs).
    if (contextual !== commands) return;
    contextual = EMPTY;
    for (const listener of listeners) listener();
  };
}
