"use client";

import { useLayoutEffect } from "react";
import { applyTheme, resolvePreference, subscribeToTheme } from "@/lib/theme";

/**
 * Keeps `<html data-theme>` honest for as long as the page is open. Draws
 * nothing.
 *
 * The inline script in the root layout settles the theme before first paint,
 * which is the whole of what a page load needs. Two things happen afterwards
 * that it can't answer for, and both belong here rather than in the switcher —
 * they are true on every view, and the switcher lives on one of them:
 *
 * - **The OS changes its mind.** A reader on "system" at dusk expects the app
 *   to turn with everything else on their screen, not at their next reload.
 *   The same listener answers for another tab having stored a different
 *   choice.
 * - **React's Strict Mode remount in development** resets `<html>` to the
 *   attributes it manages from JSX, clearing the one the script set — see the
 *   "Re-applying attributes in development" section of the
 *   preventing-flash-before-hydration guide. The layout effect below puts it
 *   back before paint. A no-op in production, where nothing removes it.
 *
 * Nothing here persists: this component only ever re-states what storage and
 * the OS already say. Writing during a re-apply would pin a reader who never
 * chose anything to whatever their OS happened to be on this visit, and they'd
 * stop following it afterwards.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    const paint = () => applyTheme(resolvePreference());
    paint();
    return subscribeToTheme(paint);
  }, []);

  return null;
}
