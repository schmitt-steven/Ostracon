"use client";

import { setPaletteOpen } from "@/lib/command/palette-state";

/**
 * The rail's search entry point — the one that made ⌘K findable.
 *
 * A button dressed as an input, which is the only honest way to draw this: it
 * has to look like the thing you type into, because that is what a search
 * affordance looks like, but typing into it would mean two carets and two
 * behaviours for one field. Clicking it opens the palette, and the first
 * keystroke lands there.
 *
 * The `⌘K` chip is the label doing double duty: a reader who has never met
 * the convention can click, and one who has never clicked can learn the
 * shortcut without being told. It's hidden on touch, where the shortcut
 * doesn't exist and the bottom bar carries this instead.
 */
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      aria-keyshortcuts="Meta+K Control+K"
      // Hover deepens the well rather than tinting over the rail behind it:
      // .row-tint composites ink onto whatever is underneath, which on a
      // control that already has a ground of its own comes out *lighter* than
      // the ground in the light theme — the box appearing to fade under the
      // pointer.
      className="well [--well-shade:0.2] flex w-full items-center gap-2.5 rounded-[var(--radius-control)] bg-sunk px-2.5 py-1.5 text-left text-[13px] text-ink-faint transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--ink)_7%,var(--sunk))] hover:text-ink-muted motion-reduce:transition-none"
    >
      {/* Same 7px footprint the rows give their marks, and the same 2.5 gap
          after it — so the magnifier sits on the column of dots and glyphs
          below it, and "Search or jump to…" starts where every row's name
          does. The glyph overhangs its footprint by 3.5px each side into the
          box's own padding, exactly as a row's does. See [RailRow]. */}
      <span
        aria-hidden
        className="flex size-[7px] shrink-0 items-center justify-center"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className="size-3.5 shrink-0"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">Search or jump to…</span>
      {/* Mono, because that is what mono is reserved for here: keyboard
          shortcuts and nothing else. */}
      <span
        aria-hidden
        className="shrink-0 font-mono text-[11px] text-ink-faint max-[999px]:hidden"
      >
        ⌘K
      </span>
    </button>
  );
}
