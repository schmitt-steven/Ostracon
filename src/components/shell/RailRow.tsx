"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

type Props = {
  href: string;
  /** What the row prints — a nested tag shows only its last segment. */
  label: string;
  count?: number;
  hue?: number;
  /** A child tag's dot is smaller and dimmer; that's the whole nesting cue. */
  child?: boolean;
  selected?: boolean;
  /** Nesting depth, used only for the text indent. */
  depth?: number;
  onContextMenu?: (event: MouseEvent) => void;
  /** Disclosure control for a row with children, rendered before the dot. */
  toggle?: React.ReactNode;
};

/**
 * One line in the rail: dot, name, count. No separators, no second line, no
 * truncation beyond the name itself.
 *
 * The selected state is the tag's own hue at 16% with the name at full
 * contrast; hover is a neutral ink tint. The two are deliberately different
 * *kinds* of signal rather than two strengths of one — "you are here" and "the
 * pointer is here" have to stay tellable apart when both are true at once.
 */
export function RailRow({
  href,
  label,
  count,
  hue,
  child = false,
  selected = false,
  depth = 0,
  onContextMenu,
  toggle,
}: Props) {
  return (
    <div
      className="relative flex items-center"
      style={{ paddingLeft: depth * 14 }}
    >
      {toggle}
      <Link
        href={href}
        aria-current={selected ? "page" : undefined}
        onContextMenu={onContextMenu}
        style={hue === undefined ? undefined : ({ "--h": hue } as React.CSSProperties)}
        className={`row-tint flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] ${
          selected
            ? // A tag lights up in its own hue; the rows that aren't tags —
              // All notes, Untagged, Images — have none to light up in, so
              // they take the neutral one instead of inheriting a colour that
              // would be saying something untrue.
              `${hue === undefined ? "row-selected" : "hue-row-selected"} text-ink`
            : "text-ink-muted"
        }`}
      >
        {hue !== undefined && (
          <span
            aria-hidden
            className={`shrink-0 rounded-full ${
              child ? "hue-dot-child size-[5px]" : "hue-dot size-[7px]"
            }`}
          />
        )}
        {/* The name is always present as text. Hue never carries meaning on
            its own — roughly one man in twelve can't separate two of the
            twelve slots, and locked lightness (good for consistency) takes
            away the brightness difference that would otherwise rescue it. */}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && (
          <span className="shrink-0 tabular-nums text-ink-faint">{count}</span>
        )}
      </Link>
    </div>
  );
}
