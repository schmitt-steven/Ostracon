"use client";

import type { ReactNode } from "react";
import { TagFilter } from "./TagFilter";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  allTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  /** Left end of the toolbar row. */
  viewSwitcher: ReactNode;
  /** Right end — the note list's sort control; the gallery has none. */
  trailing?: ReactNode;
};

/**
 * The overview's filter bar, shared by the note list and the image gallery so
 * the two filter by exactly the same thing. Returns three siblings rather than
 * wrapping them, so the parent's column gap keeps setting the rhythm.
 *
 * The state itself lives in `list-state`, which means a query or tag selection
 * carries across a switch between the two views instead of resetting.
 */
export function ListControls({
  query,
  onQueryChange,
  allTags,
  selectedTags,
  onTagsChange,
  viewSwitcher,
  trailing,
}: Props) {
  return (
    <>
      <div className="relative">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          // Notes, in both views: in the gallery this searches the notes the
          // images came from, which is the only text an upload has.
          placeholder="Search notes…"
          className="w-full rounded-full border border-line bg-surface py-3 pl-13 pr-5 text-base text-ink shadow-sm shadow-ink/5 outline-none transition-colors focus:border-blue"
        />
      </div>
      {/* Tags get the row to themselves: there can be a lot of them, and they
          wrap onto a second line, which would drag anything sharing the flow
          along with them. Rendered only when there are any, so an untagged
          collection doesn't leave a gap where the row would be. */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <TagFilter
            allTags={allTags}
            selected={selectedTags}
            onChange={onTagsChange}
          />
        </div>
      )}
      {/* Switcher left, sort pushed to the far right. The switcher is the one
          control that survives into the images view, so keeping it leftmost
          means it doesn't slide sideways when you flip between the two.
          justify-between degrades cleanly if the row ever wraps: each control
          then gets its own line, left-aligned. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {viewSwitcher}
        {trailing}
      </div>
    </>
  );
}
