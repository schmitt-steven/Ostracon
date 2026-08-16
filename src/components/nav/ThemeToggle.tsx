"use client";

import { useLayoutEffect } from "react";
import { applyTheme, currentTheme, resolveTheme } from "@/lib/theme";

/**
 * Flips the app between the two palettes in globals.css.
 *
 * Holds no React state: the theme lives on <html data-theme>, which the inline
 * script in the root layout has already set before this ever renders. The
 * button's label and icon follow that attribute through CSS (.theme-when-*),
 * so there's nothing here that could disagree with what's on screen.
 */
export function ThemeToggle() {
  // Re-applies the attribute after React's Strict Mode remount in development
  // clears it off <html> — see the "Re-applying attributes in development"
  // section of the preventing-flash-before-hydration guide. A no-op in
  // production, and never persists, since nothing was chosen here.
  useLayoutEffect(() => {
    applyTheme(resolveTheme(), { persist: false });
  }, []);

  return (
    <button
      type="button"
      onClick={() => applyTheme(currentTheme() === "dark" ? "light" : "dark")}
      // Fixed label rather than one describing the target theme: the visible
      // face already says which way this goes, and a swapped label would need
      // the state this component deliberately doesn't keep.
      aria-label="Switch between the light and dark theme"
      className="rounded-full px-3 py-1.5 text-base text-ink-muted transition-colors hover:bg-blue-wash hover:text-blue"
    >
      <span className="theme-when-light inline-flex items-center gap-2">
        <MoonIcon />
        Dark
      </span>
      <span className="theme-when-dark inline-flex items-center gap-2">
        <SunIcon />
        Light
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.8 9.6A5.9 5.9 0 0 1 6.4 2.2a5.9 5.9 0 1 0 7.4 7.4Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="2.9" />
      <path d="M8 1.4v1.3M8 13.3v1.3M1.4 8h1.3M13.3 8h1.3M3.3 3.3l.9.9M11.8 11.8l.9.9M12.7 3.3l-.9.9M4.2 11.8l-.9.9" />
    </svg>
  );
}
