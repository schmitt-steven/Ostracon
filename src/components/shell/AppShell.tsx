"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { CommandPalette } from "@/components/command/CommandPalette";
import { OfflineToast } from "@/components/pwa/OfflineToast";
import { PaletteLaunch } from "@/components/pwa/PaletteLaunch";
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
import { LogOutPrompt } from "./LogOutPrompt";
import { NoteImport } from "./NoteImport";
import { Rail, type RailData } from "./Rail";
import { ListIcon, PlusIcon, SearchIcon } from "@/icons";

type Props = {
  rail: RailData;
  /** Every tag in use, flattened — the palette's "jump to tag" list. */
  tagNames: string[];
  children: ReactNode;
};

/**
 * The shell both views share: a fixed rail and a flexing main pane, 14px
 * apart, separated only by the gap (both are lifted off --paper).
 *
 * The rail stays a flat --paper panel — it's the quietest surface in the app.
 * No `backdrop-filter` here: it would make the rail the containing block for
 * its three fixed descendants (two row menus, the rename dialog), which its
 * `overflow-hidden` would clip.
 *
 * Below 1000px the rail is an overlay drawer and the controls move to a bottom
 * bar; the spacing ratio carries the grouping alone there (no hover on touch).
 * On a wide screen it can also fold to a strip rather than vanishing, so the
 * reopen control stays where the close control was.
 */
export function AppShell({ rail, tagNames, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Outside React so scattered triggers can open it — see lib/command/palette-state.
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
      {/* .shell-inset carries the padding *and* the notch — see globals.css;
          it is where the 14px/8px breakpoint moved to. */}
      <div className="shell-inset flex h-dvh gap-[14px]">
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
        <div className="glass lift-2 bar-inset fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-2 pt-2 min-[1000px]:hidden">
          {/* "Notes", not "Tags": the drawer is the whole rail — All notes,
            All tags and Images, plus whatever is pinned — and naming it after
            one of its rows undersold where the button goes. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="row-tint flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-[13px] text-ink-muted"
          >
            <ListIcon aria-hidden className="size-3.5 shrink-0" />
            Notes
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="row-tint flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-[13px] text-ink-muted"
          >
            <SearchIcon aria-hidden className="size-3.5 shrink-0" />
            Search
          </button>
          <Link
            href="/notes/new"
            className="row-tint flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-[13px] text-ink-muted"
          >
            <PlusIcon aria-hidden className="size-3.5 shrink-0" />
            New note
          </Link>
        </div>

        <CommandPalette
          tags={tagNames}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
        />

        {/* Mounted beside the palette, and for the same reason: the window is
            the drop target, so this belongs to the shell rather than to any
            view inside it. ⌘K's "Import markdown files" opens the picker it
            owns. */}
        <NoteImport />

        {/* The confirmation ⌘K's "Log out" row asks for. Mounted here rather
            than in the rail so it survives the palette closing behind it. */}
        <LogOutPrompt />

        {/* Both belong to the shell for the same reason the palette does: one
            reports a condition the whole app is in, the other answers a
            shortcut that can land on any route. */}
        <OfflineToast />
        <PaletteLaunch />
      </div>
    </KnownTagsProvider>
  );
}
