"use client";

import { useSyncExternalStore } from "react";

// Whether the shell is in its narrow layout — same 1000px as the CSS (see
// AppShell). For the few cases where the answer changes behaviour, not just
// appearance, and a media query can't reach (the palette's command list).
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

// Wide — the server has no viewport, and guessing narrow would hide desktop
// controls until hydration.
function getServerSnapshot(): boolean {
  return false;
}

export function useCompactViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
