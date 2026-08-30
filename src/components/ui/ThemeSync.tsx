"use client";

import { useLayoutEffect } from "react";
import { applyTheme, resolvePreference, subscribeToTheme } from "@/lib/theme";

/**
 * Keeps `<html data-theme>` honest while the page is open (the layout's inline
 * script only covers first paint). Handles the OS or another tab changing the
 * theme, and re-applies the attribute after a dev Strict-Mode remount. Never
 * persists — only re-states what storage and the OS say.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    const paint = () => applyTheme(resolvePreference());
    paint();
    return subscribeToTheme(paint);
  }, []);

  return null;
}
