"use client";

export type SegmentedOption<V extends string> = {
  value: V;
  label: string;
};

type Props<V extends string> = {
  value: V;
  /** The choices, in the order they should read. */
  options: readonly SegmentedOption<V>[];
  /** Names the group for anyone not reading the labels — "View mode", "Theme". */
  label: string;
  onChange: (value: V) => void;
  /**
   * The track's display and height, which are the caller's business: the note
   * header hides this one below 1000px and stands it at the height of the
   * buttons beside it, and the settings page does neither.
   */
  className?: string;
  /** Anything a single segment needs — a minimum width, mainly. */
  segmentClassName?: string;
};

/**
 * A segmented track: one seated object with a marker that slides between its
 * segments, rather than a row of loose buttons.
 *
 * Separate hit targets sitting in a line ask the eye to work out that they
 * belong together; a track says it outright, and the marker moving from one
 * segment to the next shows the switch as one state changing instead of two
 * independent buttons lighting up. That is worth having wherever a handful of
 * fixed choices are all worth showing at once — the note's write/preview/split,
 * and the theme.
 *
 * It is made of parts the rest of the app is already made of. The track is a
 * `.well` — the same hole-in-a-panel the search field and the filter field are
 * cut as — and the marker is `.row-selected`, the neutral "you are here" the
 * rail paints under All notes. A segmented control drawn in tones of its own
 * would have been a fourth idea of what "recessed" and "selected" look like;
 * there are supposed to be one of each.
 *
 * The well is filled in translucent ink rather than --sunk, unlike those two
 * fields: they sit on the rail, which is a flat surface, and these sit over a
 * pane's coloured wash or in a sunk panel, where a flat grey box reads as a
 * grey box dropped on top instead of a step down into what's behind it. The
 * shade is taken down the way the search trigger takes it down: the well's
 * default lip is set for a field you type into, and at this height it reads as
 * a line ruled across the top rather than as depth.
 *
 * Nothing here is coloured: colour in this design means "this is a tag", and
 * spending it on a switch would dilute the one thing hue is for.
 */
export function Segmented<V extends string>({
  value,
  options,
  label,
  onChange,
  className = "",
  segmentClassName = "",
}: Props<V>) {
  // Falls back to the first segment rather than hiding the marker: a track
  // with nothing lit reads as broken, and a value outside the list is a bug
  // upstream, not a state to draw.
  const index = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );

  return (
    <div
      role="group"
      aria-label={label}
      // p-0.5 is the track's inset, and the marker's `inset-y-0.5` / `left-0.5`
      // / `-4px` below are that same 2px — the marker sits inside the track
      // rather than on top of its edge.
      className={`well [--well-shade:0.2] relative shrink-0 rounded-[var(--radius-control)] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-0.5 ${className}`}
      // Equal columns, so the marker's fraction always matches the segment
      // under it and the track doesn't jitter as the labels change length.
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
        className="row-selected pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[calc(var(--radius-control)-2px)] transition-transform duration-[var(--tint-motion)] ease-out motion-reduce:transition-none"
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            // No vertical padding: the grid stretches each segment to the
            // track, so the height is set in one place instead of being added
            // up from three.
            className={`relative rounded-[calc(var(--radius-control)-2px)] px-3 text-[13px] transition-colors duration-[var(--tint-motion)] motion-reduce:transition-none ${
              active ? "text-ink" : "text-ink-faint hover:text-ink-muted"
            } ${segmentClassName}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
