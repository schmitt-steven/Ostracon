"use client";

import { SearchIcon } from "@/icons";

import { usePathname } from "next/navigation";
import { setSearchMenuOpen } from "@/lib/search-menu/menu-state";
import { scopeFromPath, scopePrompt } from "@/lib/search-menu/scope";
import { useSearchMenuShortcut } from "@/hooks/use-search-menu-shortcut";

/**
 * The sidebar's search entry point — a button dressed as an input. Clicking
 * opens the search menu; the first keystroke lands there. It reads the route
 * like the search menu does, so on a tag's page it says `Search #infra…` and
 * matches what the search menu then opens. The `⌘K` chip teaches the shortcut;
 * hidden on touch.
 */
export function SearchTrigger() {
  const scope = scopeFromPath(usePathname());
  const shortcut = useSearchMenuShortcut();

  return (
    <button
      type="button"
      onClick={() => setSearchMenuOpen(true)}
      aria-keyshortcuts="Meta+K Control+K"
      // Hover deepens the well rather than tinting over the sidebar behind it:
      // .row-tint composites ink onto whatever is underneath, which on a
      // control that already has a ground of its own comes out *lighter* than
      // the ground in the light theme — the box appearing to fade under the
      // pointer.
      className="well well-shallow flex w-full items-center gap-2.5 rounded-[var(--radius-control)] bg-sunk px-2.5 py-1.5 text-left text-[14px] leading-[1.15] text-ink-faint transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--ink)_7%,var(--sunk))] hover:text-ink-muted motion-reduce:transition-none"
    >
      {/* Same 7px footprint the rows give their marks, and the same 2.5 gap
          after it — so the magnifier sits on the column of dots and glyphs
          below it, and "Search or jump to…" starts where every row's name
          does. The glyph overhangs its footprint by 3.5px each side into the
          box's own padding, exactly as a row's does. See [SidebarRow]. */}
      <span
        aria-hidden
        className="flex size-[7px] shrink-0 items-center justify-center"
      >
        <SearchIcon className="size-3.5 shrink-0" />
      </span>
      {/* Truncates rather than shortening: a long tag has to give way at the
          end of a 240px column, and `Search #infra/deploy…` cut is still the
          same sentence as the one the field will show. */}
      <span className="min-w-0 flex-1 truncate">
        {scope ? `${scopePrompt(scope)}…` : "Search, do, or jump to…"}
      </span>
      {/* Mono, because that is what mono is reserved for here: keyboard
          shortcuts and nothing else. */}
      <span
        aria-hidden
        className="shrink-0 font-mono text-[11px] text-ink-faint max-[999px]:hidden"
      >
        {shortcut}
      </span>
    </button>
  );
}
