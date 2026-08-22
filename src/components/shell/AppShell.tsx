"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { CommandPalette } from "@/components/command/CommandPalette";
import {
  getPaletteOpen,
  getServerPaletteOpen,
  setPaletteOpen,
  subscribePaletteOpen,
} from "@/lib/command/palette-state";
import {
  getRailOpen,
  getServerRailOpen,
  subscribeRailOpen,
  toggleRailOpen,
} from "@/lib/ui/rail-state";
import { KnownTagsProvider } from "./KnownTags";
import { Rail, type RailData } from "./Rail";

type Props = {
  rail: RailData;
  /** Every tag in use, flattened — the palette's "jump to tag" list. */
  tagNames: string[];
  children: ReactNode;
};

/**
 * The shell both views share: a fixed rail and a flexing main pane, 14px
 * apart, with no line between them. What separates them is the gap itself and
 * the fact that both are lifted off --paper, which shows through it.
 *
 * The rail is a flat --paper panel and stays one. It is the quietest surface
 * in the app — a column of names you read past on the way to the thing you
 * actually want — and every treatment that would make it interesting (a veil,
 * a blur, a grain) makes it compete with the pane it exists to get you to.
 * What it shares with everything else is the *hover*: see THE GLASS FINISH in
 * globals.css, which is where this app's glass lives.
 *
 * A blur here would also be a bug rather than a style. A `backdrop-filter`
 * other than `none` makes an element the containing block for every
 * fixed-position descendant, and the rail hosts three — its two row menus and
 * the rename dialog — which its own `overflow-hidden` would then clip away.
 *
 * Below 1000px the rail becomes an overlay drawer and the shell-level controls
 * move to a bottom bar. That breakpoint is where the spacing ratio has to
 * carry the grouping entirely on its own: there is no hover on touch, so every
 * cue that depended on the pointer is simply absent there.
 *
 * On a wide screen the rail can also be folded away to a strip. It narrows
 * rather than disappearing, because the control that brings it back has to
 * stay where the control that sent it away was — a rail that vanished
 * completely would need its reopen button floating over the reading pane, in
 * the one column of the layout that is deliberately kept clear.
 */
export function AppShell({ rail, tagNames, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Held outside React so the header hints and the bottom bar can open it
  // without a path down from here — see lib/command/palette-state.
  const paletteOpen = useSyncExternalStore(
    subscribePaletteOpen,
    getPaletteOpen,
    getServerPaletteOpen,
  );
  // Same arrangement, and stored: see lib/ui/rail-state for why the server
  // renders this open regardless of what the reader last chose.
  const railOpen = useSyncExternalStore(
    subscribeRailOpen,
    getRailOpen,
    getServerRailOpen,
  );

  return (
    <KnownTagsProvider tags={tagNames}>
      <div className="flex h-dvh gap-[14px] p-[14px] max-[999px]:p-2 max-[999px]:pb-0">
        <aside
          // Width is the only thing that animates; the rail swaps to its strip
          // layout on the first frame. Cross-fading the contents as well would
          // draw the eye to the fold, which is the opposite of what folding
          // something away is for.
          className={`bg-paper hidden shrink-0 overflow-hidden rounded-[var(--radius-zone)] transition-[width] duration-200 ease-out motion-reduce:transition-none min-[1000px]:block ${
            railOpen ? "w-60" : "w-[52px]"
          }`}
        >
          <Rail
            data={rail}
            collapsed={!railOpen}
            onToggleCollapsed={toggleRailOpen}
          />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 min-[1000px]:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="scrim absolute inset-0"
            />
            <div className="bg-paper lift-3 absolute inset-y-2 left-2 w-64 overflow-hidden rounded-[var(--radius-zone)]">
              <Rail data={rail} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        {/* min-w-0 so a long title inside wraps instead of forcing this track
          wider than the viewport — the overflow bug that used to let stray
          characters escape the toolbar. */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-zone)]">
          {children}
        </main>

        {/* Bottom bar, touch only. The controls that live in the pane header on
          a wide screen sit at thumb height here instead. */}
        <div className="glass lift-2 fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-2 px-4 py-2 min-[1000px]:hidden">
          {/* "Notes", not "Tags": the drawer is the whole rail — All notes,
            Untagged and Images sit above the tag tree in it — and naming it
            after one of its sections undersold where the button goes. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="row-tint flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-[13px] text-ink-muted"
          >
            <ListIcon />
            Notes
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="row-tint flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-[13px] text-ink-muted"
          >
            <SearchIcon />
            Search
          </button>
          <Link
            href="/notes/new"
            className="row-tint flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-[13px] text-ink-muted"
          >
            <PlusIcon />
            New note
          </Link>
        </div>

        <CommandPalette
          tags={tagNames}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
        />
      </div>
    </KnownTagsProvider>
  );
}

/* The bottom bar's glyphs. Drawn here rather than imported from the rail
   because that file keeps its own set the same way — three inline paths are
   cheaper than a module every component then has to agree with. Same
   size-3.5, same weights, so the two navigations read as one family. */
function ListIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.8 4.2h10.4M2.8 8h10.4M2.8 11.8h6.4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </svg>
  );
}
