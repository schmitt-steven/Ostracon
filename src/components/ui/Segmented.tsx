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
 * A segmented track — one seated object with a marker sliding between segments,
 * not a row of loose buttons. Built from parts the app already has: the track
 * is a `.well`, the marker is `.row-selected`. The well is filled in
 * translucent ink (not --sunk) and uses `.well-shallow` lips, because it sits
 * over a pane's wash rather than the flat rail. Nothing here is coloured —
 * hue means "tag".
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
      className={`well well-shallow relative shrink-0 rounded-[var(--radius-control)] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-0.5 ${className}`}
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
