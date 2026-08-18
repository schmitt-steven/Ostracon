"use client";

export type SortMode = "edited" | "created" | "oldest" | "longest";

export const SORT_MODES: readonly SortMode[] = [
  "edited",
  "created",
  "oldest",
  "longest",
];

export const SORT_LABEL: Record<SortMode, string> = {
  edited: "Recently edited",
  created: "Recently created",
  oldest: "Oldest",
  longest: "Longest",
};

/**
 * The index's sort, and "recently edited" is the default — which is also why
 * there's no separate "Recent" section anywhere: the default view of
 * everything, sorted this way, already *is* that section.
 *
 * The four run newest-first, then oldest, then by size: the three time-based
 * ones are variations of one question and belong next to each other, and the
 * one that ignores time follows. "Recently created" is spelled out rather than
 * left as "Created" now that "Oldest" sits under it — on its own it read as a
 * field name, and beside its opposite it has to read as a direction.
 *
 * A bare select with no chrome — no fill, no outline. It sits at the right end
 * of a header that has no border under it, and a drawn control there would be
 * the loudest thing on screen for something read once a week.
 *
 * The chevron is the one mark it does get, and it is not decoration: with the
 * native arrow suppressed, "Recently edited" sitting alone in the corner reads
 * as a status line describing the list rather than as a control that changes
 * it. Everything else here is revealed on reach; this has to be legible before
 * anyone reaches for it, because nothing else on the screen says the sort can
 * be changed at all.
 */
export function SortControl({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}) {
  return (
    // The chevron is a sibling, not a background image: it has to inherit the
    // select's colour so both halves lighten together on hover, and a
    // background-image can't be told what currentColor is.
    <div className="row-tint group relative shrink-0 rounded-[var(--radius-control)]">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SortMode)}
        aria-label="Sort notes"
        // Text left-aligned because the chevron now leads it: the mark stays
        // put while the labels change length behind it, so the one fixed thing
        // in the corner is the part that says this is a control.
        className="cursor-pointer appearance-none bg-transparent py-1 pl-6 pr-2 text-left text-[13px] text-ink-muted outline-none group-hover:text-ink"
      >
        {SORT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {SORT_LABEL[mode]}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute left-2 top-1/2 size-2.5 -translate-y-1/2 text-ink-faint group-hover:text-ink-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
      </svg>
    </div>
  );
}
