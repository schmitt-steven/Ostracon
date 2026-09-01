"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { DotsIcon } from "@/icons";

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
  /** Opens the row's menu from a ⋯ button under the pointer; the fixed views
   * don't pass it. */
  onOpenMenu?: (at: { x: number; y: number }) => void;
  /** That menu is open for this row: the button stays out while it is. */
  menuOpen?: boolean;
  /** Disclosure control for a row with children, rendered before the dot. */
  toggle?: React.ReactNode;
  /** Drawn in the dot's place, for rows that stand for a place, not a tag. */
  icon?: React.ReactNode;
};

/**
 * One sidebar line: dot or icon, name, count. Selected = the tag's hue at 16%
 * with full-contrast name; hover = a neutral ink tint — two different kinds of
 * signal. A row with a menu trades its count for the ⋯ button on hover.
 */
export function SidebarRow({
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
        className={`row-tint flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[14px] leading-[1.15] ${
          selected
            ? // A tag lights in its hue; the fixed views take the neutral tint.
              `${hue === undefined ? "row-selected" : "hue-row-selected"} text-ink`
            : "text-ink-muted"
        }`}
      >
        {/* Every row opens with a mark on the same left edge: a hue disc for a
            tag, a plain ring for a pinned note, a glyph for the fixed views.
            The glyph sits in the dot's 7px footprint, overhanging into the
            row's padding. */}
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
                ? "sidebar-dot size-[7px]"
                : child
                  ? "hue-dot-child size-[5px]"
                  : "hue-dot size-[7px]"
            }`}
          />
        )}

        {/* The name is always text — hue never carries meaning alone. */}
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

      {/* Outside the link (no button inside an anchor); last in the DOM. */}
      {onOpenMenu && (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Options for ${label}`}
          // Swallowed so the toggle can close what it opened, and off the
          // sidebar's click handler (which shuts the touch drawer).
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            // Anchored to the button — the keyboard has no coordinates.
            const box = event.currentTarget.getBoundingClientRect();
            onOpenMenu({ x: box.right - 4, y: box.bottom + 4 });
          }}
          className={`row-tint absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] text-ink-faint transition-opacity duration-150 hover:text-ink motion-reduce:transition-none ${
            menuOpen
              ? "opacity-100"
              : // Hidden by opacity (not visibility) so focus can summon it;
                // always shown on touch, which can't hover.
                "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
          }`}
        >
          <DotsIcon aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  );
}
