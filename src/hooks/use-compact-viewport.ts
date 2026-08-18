"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the shell is in its narrow layout — the rail as a drawer, the
 * controls in the bottom bar.
 *
 * The same 1000px the CSS switches at (see AppShell), because the two can't
 * disagree about what a small screen is. Layout should keep answering this in
 * CSS, which is right on the first paint and costs nothing; this is for the
 * few places where the answer changes behaviour rather than appearance and a
 * media query can't reach — the palette's command list, today.
 */
const QUERY = "(max-width: 999px)";

let mql: MediaQueryList | null = null;

function query(): MediaQueryList {
  return (mql ??= window.matchMedia(QUERY));
}

function subscribe(onChange: () => void): () => void {
  const list = query();
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return query().matches;
}

/**
 * Wide. The server has no viewport to measure, and this hook's callers only
 * add or remove things that are already unreachable on a phone by other
 * means — so guessing wide costs nothing, while guessing narrow would hide
 * controls from every desktop until hydration caught up.
 */
function getServerSnapshot(): boolean {
  return false;
}

export function useCompactViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
