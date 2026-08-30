"use client";

import { useCallback, useSyncExternalStore } from "react";
import { tagHue, tagRoot } from "@/lib/tags/hue";
import {
  getServerTagPreferences,
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
  const preferences = useSyncExternalStore(
    subscribeTagPreferences,
    getTagPreferences,
    getServerTagPreferences,
  );

  const hueOf = useCallback(
    (name: string) => preferences.hues[tagRoot(name)] ?? tagHue(name),
    [preferences],
  );

  return { preferences, hueOf };
}
