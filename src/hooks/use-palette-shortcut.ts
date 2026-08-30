"use client";

import { useSyncExternalStore } from "react";

/**
 * The command-palette shortcut label: `⌘K` on a Mac, `Ctrl K` elsewhere. Only
 * the hint — the palette binds both. Goes through useSyncExternalStore (with a
 * no-op subscribe) so server/client can disagree without a hydration error.
 */
function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    // userAgentData where available, navigator.platform as fallback.
    (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData?.platform ||
    navigator.platform ||
    "";
  return /mac/i.test(platform);
}

function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): string {
  return isMac() ? "⌘K" : "Ctrl K";
}

// `⌘K` — the server can't see the platform; a Windows reader sees it correct
// on hydration.
function getServerSnapshot(): string {
  return "⌘K";
}

/** The palette shortcut as a label: `⌘K` on macOS, `Ctrl K` elsewhere. */
export function usePaletteShortcut(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
