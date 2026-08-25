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
  /**
   * Opens the same menu the right-click does, from a ⋯ button that appears at
   * the row's right edge under the pointer. Rows without one — the three fixed
   * views — simply don't pass it.
   */
  onOpenMenu?: (at: { x: number; y: number }) => void;
  /** That menu is open for this row: the button stays out while it is. */
  menuOpen?: boolean;
  /** Disclosure control for a row with children, rendered before the dot. */
  toggle?: React.ReactNode;
  /**
   * Drawn in the dot's place. For the rows that stand for a place rather than
   * a tag — a glyph says which place; a dot could only say "a row".
   */
  icon?: React.ReactNode;
};

/**
 * One line in the rail: dot or icon, name, count. No separators, no second
 * line, no truncation beyond the name itself.
 *
 * The selected state is the tag's own hue at 16% with the name at full
 * contrast; hover is a neutral ink tint. The two are deliberately different
 * *kinds* of signal rather than two strengths of one — "you are here" and "the
 * pointer is here" have to stay tellable apart when both are true at once.
 *
 * Under the pointer, a row with a menu trades its count for the ⋯ button that
 * opens it. Trades rather than makes room for: shifting the count left would
 * move a number the eye is already reading, and the count is the one thing on
 * the row you don't need while you're reaching for its menu.
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
  onOpenMenu,
  menuOpen = false,
  toggle,
  icon,
}: Props) {
  return (
    <div
      className="row-tint-host group relative flex items-center"
      style={{ paddingLeft: depth * 14 }}
    >
      {toggle}
      <Link
        href={href}
        aria-current={selected ? "page" : undefined}
        onContextMenu={onContextMenu}
        style={
          hue === undefined
            ? undefined
            : ({ "--h": hue } as React.CSSProperties)
        }
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
        {/* Every row opens with a mark on the same left edge, so every name in
            the rail starts on the same one. A tag's is a disc in its own hue;
            a pinned note's is a plain ring; the three fixed views get a glyph
            instead, since they're places and a dot can't tell you which.

            The glyph sits *in* the dot's 7px footprint rather than beside it —
            centred there it overhangs 3.5px each side into the row's own
            padding, which costs the names nothing and keeps them aligned
            across the groups. */}
        {icon ? (
          <span
            aria-hidden
            className="flex size-[7px] shrink-0 items-center justify-center"
          >
            {icon}
          </span>
        ) : (
          <span
            aria-hidden
            className={`shrink-0 rounded-full ${
              hue === undefined
                ? "rail-dot size-[7px]"
                : child
                  ? "hue-dot-child size-[5px]"
                  : "hue-dot size-[7px]"
            }`}
          />
        )}

        {/* The name is always present as text. Hue never carries meaning on
            its own — roughly one man in twelve can't separate two of the
            sixteen slots, and locked lightness (good for consistency) takes
            away the brightness difference that would otherwise rescue it. */}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && (
          <span
            className={`shrink-0 tabular-nums text-ink-faint transition-opacity duration-150 motion-reduce:transition-none ${
              onOpenMenu
                ? menuOpen
                  ? "opacity-0"
                  : "group-hover:opacity-0"
                : ""
            }`}
          >
            {count}
          </span>
        )}
      </Link>

      {/* Outside the link because a button inside an anchor isn't markup, so
          it's placed over the count's own corner instead. Last in the DOM as
          well as on screen: tab reaches the row, then the row's menu. */}
      {onOpenMenu && (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Options for ${label}`}
          // Swallowed so the open menu's dismiss-on-outside-press doesn't
          // close it half a frame before the click would reopen it — that
          // makes the button a toggle rather than a control that never
          // closes what it opened. It also keeps the press off the rail's own
          // click handler, which shuts the touch drawer.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            // Anchored to the button rather than to the pointer: activating it
            // from the keyboard reports no coordinates at all, and a menu that
            // opens in the corner of the screen isn't the same control.
            const box = event.currentTarget.getBoundingClientRect();
            onOpenMenu({ x: box.right - 4, y: box.bottom + 4 });
          }}
          className={`row-tint absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] text-ink-faint transition-opacity duration-150 hover:text-ink motion-reduce:transition-none ${
            menuOpen
              ? "opacity-100"
              : // Hidden but still in the tab order — opacity, not visibility,
                // is what lets it appear on focus for a keyboard. Pointers
                // that can't hover have no way to summon it, so on those it
                // simply stands there.
                "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
          }`}
        >
          <DotsIcon />
        </button>
      )}
    </div>
  );
}

function DotsIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="currentColor"
    >
      <circle cx="8" cy="3.4" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="8" cy="12.6" r="1.15" />
    </svg>
  );
}
