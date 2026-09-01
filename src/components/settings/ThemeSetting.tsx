"use client";

import { useSyncExternalStore } from "react";
import { Segmented } from "@/components/ui/Segmented";
import {
  applyPreference,
  storedPreference,
  subscribeToTheme,
  THEME_PREFERENCES,
  type ThemePreference,
} from "@/lib/theme";
import { SettingRow } from "./SettingRow";

/** What the server has to assume, having no storage to read: the default. */
const serverPreference = (): ThemePreference => "system";

/**
 * Appearance's one control: the theme. A segmented track (three answers, one
 * of them "System" — follow the OS). It shows the *preference*, so "System"
 * stays selected through a dusk that turns the app dark. No React state — the
 * choice lives in storage, read via [useSyncExternalStore].
 */
export function ThemeSetting() {
  const preference = useSyncExternalStore(
    subscribeToTheme,
    storedPreference,
    serverPreference,
  );

  return (
    // No note — the three segments are the explanation.
    <SettingRow
      name="Theme"
      control={
        <Segmented
          label="Theme"
          value={preference}
          options={THEME_PREFERENCES}
          // Paints, records, and notifies every subscriber.
          onChange={applyPreference}
          className="grid h-8 shrink-0"
          segmentClassName="min-w-[64px] px-3"
        />
      }
    />
  );
}
