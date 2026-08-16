"use client";

import type { ReactNode } from "react";
import {
  RECENCY_LABEL,
  RECENCY_MODES,
  type NoteRecency,
} from "@/lib/notes/recency";
import { TagFilter } from "./TagFilter";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  allTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  /** Which of the automatic tags are currently selected. */
  selectedRecency: NoteRecency[];
  onRecencyChange: (next: NoteRecency[]) => void;
  /**
   * Which of them any note actually carries — each is offered only when it
   * would match something, the way an unused tag never appears.
   */
  availableRecency: NoteRecency[];
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
  selectedRecency,
  onRecencyChange,
  availableRecency,
  viewSwitcher,
  trailing,
}: Props) {
  // A pill is still offered while it's selected even if nothing carries it any
  // more (the last matching note deleted, or the tab left open past midnight):
  // taking it away mid-filter would leave the view empty with no visible
  // reason and nothing to click to undo it. Filtered through RECENCY_MODES so
  // the two keep their order however they got here.
  const offeredRecency = RECENCY_MODES.filter(
    (mode) => availableRecency.includes(mode) || selectedRecency.includes(mode),
  );

  function toggleRecency(mode: NoteRecency) {
    onRecencyChange(
      selectedRecency.includes(mode)
        ? selectedRecency.filter((m) => m !== mode)
        : [...selectedRecency, mode],
    );
  }

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
          className="w-full rounded-full border border-line bg-surface py-3 pl-13 pr-5 text-base text-ink shadow-sm shadow-shade/5 outline-none transition-colors focus:border-action"
        />
      </div>
      {/* Tags get the row to themselves: there can be a lot of them, and they
          wrap onto a second line, which would drag anything sharing the flow
          along with them. Rendered only when there are any, so an untagged
          collection doesn't leave a gap where the row would be. */}
      {(allTags.length > 0 || offeredRecency.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {/* First in the row, so they stay in the same place however many
              tags follow. Styled as the tag filters are, in --action, because
              that's what they are here — a control, and the palette keeps the
              clickable half of the theme in --action; the ambient orange these
              wear on the note would be claiming the wrong role in a row of
              buttons. A tag already looks different as a filter than it does
              on a note, so what carries them across is the dashed border and
              the label. */}
          {offeredRecency.map((mode) => {
            const active = selectedRecency.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                onClick={() => toggleRecency(mode)}
                className={
                  active
                    ? "rounded-full border border-dashed border-paper/45 bg-action px-3.5 py-1.5 text-sm font-medium text-paper transition-colors"
                    : "rounded-full border border-dashed border-line-strong px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-action hover:text-action"
                }
              >
                {RECENCY_LABEL[mode]}
              </button>
            );
          })}
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
