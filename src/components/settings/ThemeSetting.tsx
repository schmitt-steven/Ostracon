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

/** What the server has to assume, having no storage to read: the default. */
const serverPreference = (): ThemePreference => "system";

/**
 * Appearance's one control: which palette the app is drawn in.
 *
 * A segmented track rather than the two-state button this replaces, because
 * there are three answers now and one of them isn't a palette. "System" is a
 * standing instruction — follow the OS, tonight included — and a button that
 * merely swapped light for dark had no way to say it, let alone to show that
 * it is the state you start in. Three segments show all three at once, which
 * is the point of the shape: the reader can see that following the OS is an
 * option without pressing anything.
 *
 * What is shown selected is the *preference*, not the palette. Storing which
 * of the two the OS currently resolves to would silently pin a reader to it,
 * so "System" stays selected through a dusk that turns the app dark around it.
 *
 * There is no React state here: the choice lives in storage, and the track
 * reads it through [useSyncExternalStore] on every render that matters. React
 * state would be a second copy of the same fact, free to drift from it — the
 * app has other windows onto this theme, and the one place a reader will look
 * to check it is this control. The server snapshot is the default, since a
 * server has no storage to read; React swaps in the real one as it hydrates,
 * before paint, so the wrong segment is never seen selected.
 */
export function ThemeSetting() {
  const preference = useSyncExternalStore(
    subscribeToTheme,
    storedPreference,
    serverPreference,
  );

  return (
    // Wraps rather than crushes: below about 380px of section the label and
    // the track can't share a line, and a three-segment control squeezed to
    // fit would lose its labels before the sentence beside it lost anything.
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      {/* A paragraph, not a <label>: there is no single form control to be the
          label *of* — the track is a group of buttons — and the same word is
          on the group as its spoken name.

          The word alone, with no line under it explaining what System means.
          The three segments are the explanation, and a sentence spent saying
          that the system setting is the system's is text for its own sake. */}
      {/* 15px, not the 13px everything inside a control is set in. This is the
          name of a setting standing on the page, one step down from the 22px
          section heading above it — at 13px it read as a caption for the track
          rather than as the thing the track answers. */}
      <p className="min-w-0 text-[15px] text-ink">Theme</p>
      <Segmented
        label="Theme"
        value={preference}
        options={THEME_PREFERENCES}
        // Paints, records, and tells every subscriber — this track included —
        // that the answer has changed. Nothing to set here by hand.
        onChange={applyPreference}
        // Taller than the note header's h-7: nothing here has to line up with
        // a row of icon buttons, and a control that is the only thing in its
        // panel can stand at the height it wants to be pressed at.
        className="grid h-8"
        segmentClassName="min-w-[64px]"
      />
    </div>
  );
}
