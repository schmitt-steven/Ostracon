"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { EMPTY_TAG_PREFERENCES } from "@/lib/tags/preferences-shape";
import {
  liftLegacyTagPreferences,
  seedTagPreferences,
  type TagPreferences,
} from "@/lib/tags/preferences";

/**
 * The stored tag preferences, on their way to the store in lib/tags/preferences.
 *
 * Two routes for one value, because the store is a module-level singleton and
 * the server renders every reader's page in one process:
 *
 *   - In the browser it is seeded into the store during render (not an effect,
 *     which lands after the first paint — the sidebar would draw an empty
 *     pinned section and then fill it in). One tab, one store, no sharing.
 *   - On the server it goes through context only, and never into the store.
 *     Module state there outlives the request that set it, so a seed would
 *     leave the first render of the process answering for every later one.
 *
 * Context is what `useSyncExternalStore` reads as its server snapshot (see
 * use-tag-hues), so SSR and the hydration pass both see the row and agree.
 */
const StoredTagPreferencesContext = createContext<TagPreferences>(
  EMPTY_TAG_PREFERENCES,
);

export function TagPreferencesProvider({
  stored,
  children,
}: {
  stored: TagPreferences;
  children: ReactNode;
}) {
  if (typeof window !== "undefined") seedTagPreferences(stored);

  // After the first paint, and only ever once per browser: whatever a pre-sync
  // build of this app left in localStorage.
  useEffect(() => {
    liftLegacyTagPreferences();
  }, []);

  return (
    <StoredTagPreferencesContext.Provider value={stored}>
      {children}
    </StoredTagPreferencesContext.Provider>
  );
}

/** The row as rendered, for the server and hydration snapshots. Empty outside
 *  the shell (the login page). */
export function useStoredTagPreferences(): TagPreferences {
  return useContext(StoredTagPreferencesContext);
}
