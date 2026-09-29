"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useStoredTagPreferences } from "@/components/shell/TagPreferencesProvider";
import { tagHue, tagRoot } from "@/lib/tags/hue";
import {
  getTagPreferences,
  subscribeTagPreferences,
  type TagPreferences,
} from "@/lib/tags/preferences";

export type TagHues = {
  preferences: TagPreferences;
  /** The hue to render a tag in: its family's override, else its derived one. */
  hueOf: (name: string) => number;
};

/**
 * Resolved tag hues. Overrides are keyed on the root tag — children inherit
 * their parent's hue.
 */
export function useTagHues(): TagHues {
  // The server and hydration snapshots come from context rather than the store
  // — see [TagPreferencesProvider]. Both answer with the row the page was
  // rendered from, so there is nothing to reconcile.
  const stored = useStoredTagPreferences();
  const preferences = useSyncExternalStore(
    subscribeTagPreferences,
    getTagPreferences,
    () => stored,
  );

  const hueOf = useCallback(
    (name: string) => preferences.hues[tagRoot(name)] ?? tagHue(name),
    [preferences],
  );

  return { preferences, hueOf };
}
