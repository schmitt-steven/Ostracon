"use client";

import { SearchIcon } from "@/icons";

import { usePathname } from "next/navigation";
import { setPaletteOpen } from "@/lib/command/palette-state";
import { scopeFromPath, scopePrompt } from "@/lib/command/scope";
import { usePaletteShortcut } from "@/hooks/use-palette-shortcut";

/**
 * The rail's search entry point — the one that made ⌘K findable.
 *
 * A button dressed as an input, which is the only honest way to draw this: it
 * has to look like the thing you type into, because that is what a search
 * affordance looks like, but typing into it would mean two carets and two
 * behaviours for one field. Clicking it opens the palette, and the first
 * keystroke lands there.
 *
 * Which means it has to say what the palette will actually do. It reads the
 * route the same way the palette does, so on a tag's page this says `Search
 * #infra…` and the field it opens says the same thing with the chip beside
 * it. Fixed wording was the one thing here that could be wrong: it offered to
 * jump anywhere from inside a tag the palette then opened already narrowed
 * to, and the surprise landed after the click rather than before it.
 *
 * Off a scoped route it goes back to naming all three verbs. A palette that
 * also *does* things and *goes* places has to say so somewhere, and this is
 * the only door with room for the sentence.
 *
 * The `⌘K` chip is the label doing double duty: a reader who has never met
 * the convention can click, and one who has never clicked can learn the
 * shortcut without being told. It's hidden on touch, where the shortcut
 * doesn't exist and the bottom bar carries this instead.
 */
export function SearchTrigger() {
  const scope = scopeFromPath(usePathname());
  const shortcut = usePaletteShortcut();

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
      className="well well-shallow flex w-full items-center gap-2.5 rounded-[var(--radius-control)] bg-sunk px-2.5 py-1.5 text-left text-[13px] text-ink-faint transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--ink)_7%,var(--sunk))] hover:text-ink-muted motion-reduce:transition-none"
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
