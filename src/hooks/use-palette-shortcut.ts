"use client";

import { useSyncExternalStore } from "react";

/**
 * How to spell the command-palette shortcut for the machine reading it:
 * `⌘K` on a Mac, `Ctrl K` everywhere else. The palette itself binds both
 * (see CommandPalette's key handler), so this is only about the hint.
 *
 * The platform never changes under a live page, so there is nothing to
 * subscribe to — the store is a constant and `subscribe` is a no-op. It still
 * goes through useSyncExternalStore so the server and the first client render
 * can disagree without React treating it as a hydration error.
 */
function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    // userAgentData is the current API; navigator.platform is the fallback
    // that still works everywhere it doesn't.
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

/**
 * Mac. The server can't see the client's platform, and `⌘K` is what this app
 * has always rendered — so a Windows reader sees it correct itself on
 * hydration, and nobody sees it change the other way.
 */
function getServerSnapshot(): string {
  return "⌘K";
}

/** The palette shortcut as a label: `⌘K` on macOS, `Ctrl K` elsewhere. */
export function usePaletteShortcut(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
