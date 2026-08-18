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
import { Rail, type RailData } from "./Rail";

type Props = {
  rail: RailData;
  /** Every tag in use, flattened — the palette's "jump to tag" list. */
  tagNames: string[];
  children: ReactNode;
};

/**
 * The shell both views share: a fixed rail and a flexing main pane, 14px
 * apart, with no line between them. What separates the two is a 2–3% step in
 * lightness — the rail is the lighter field — and the gap itself.
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
    <div className="flex h-dvh gap-[14px] p-[14px] max-[999px]:p-2 max-[999px]:pb-0">
      <aside
        // Width is the only thing that animates; the rail swaps to its strip
        // layout on the first frame. Cross-fading the contents as well would
        // draw the eye to the fold, which is the opposite of what folding
        // something away is for.
        className={`hidden shrink-0 overflow-hidden rounded-[var(--radius-zone)] bg-paper transition-[width] duration-200 ease-out motion-reduce:transition-none min-[1000px]:block ${
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
            className="absolute inset-0 bg-shade/40"
          />
          <div className="absolute inset-y-2 left-2 w-64 overflow-hidden rounded-[var(--radius-zone)] bg-paper shadow-xl shadow-shade/25">
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
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-2 bg-paper/90 px-4 py-2 backdrop-blur-md min-[1000px]:hidden">
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
