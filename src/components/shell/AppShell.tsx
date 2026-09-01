"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { SearchMenu } from "@/components/search/SearchMenu";
import { OfflineToast } from "@/components/pwa/OfflineToast";
import { SearchMenuLaunch } from "@/components/pwa/SearchMenuLaunch";
import {
  getSearchMenuOpen,
  getServerSearchMenuOpen,
  setSearchMenuOpen,
  subscribeSearchMenuOpen,
} from "@/lib/search-menu/menu-state";
import {
  getSidebarOpen,
  getServerSidebarOpen,
  subscribeSidebarOpen,
  toggleSidebarOpen,
} from "@/lib/ui/sidebar-state";
import { TagNamesProvider } from "./TagNames";
import { LogOutPrompt } from "./LogOutPrompt";
import { NoteImport } from "./NoteImport";
import { Sidebar, type SidebarData } from "./Sidebar";
import { ListIcon, PlusIcon, SearchIcon } from "@/icons";

type Props = {
  sidebar: SidebarData;
  /** Every tag in use, flattened — the search menu's "jump to tag" list. */
  tagNames: string[];
  children: ReactNode;
};

/**
 * The shell both views share: a fixed sidebar and a flexing content area, 14px
 * apart, separated only by the gap (both are lifted off --paper).
 *
 * The sidebar stays a flat --paper panel — it's the quietest surface in the
 * app. No `backdrop-filter` here: it would make the sidebar the containing
 * block for its three fixed descendants (two row menus, the rename dialog),
 * which its `overflow-hidden` would clip.
 *
 * Below 1000px the sidebar is an overlay drawer and the controls move to a
 * bottom bar; the spacing ratio carries the grouping alone there (no hover on
 * touch). On a wide screen it can also fold to a strip rather than vanishing,
 * so the reopen control stays where the close control was.
 */
export function AppShell({ sidebar, tagNames, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Outside React so scattered triggers can open it — see
  // lib/search-menu/menu-state.
  const searchMenuOpen = useSyncExternalStore(
    subscribeSearchMenuOpen,
    getSearchMenuOpen,
    getServerSearchMenuOpen,
  );
  // Same arrangement, and stored: see lib/ui/sidebar-state for why the server
  // renders this open regardless of what the reader last chose.
  const sidebarOpen = useSyncExternalStore(
    subscribeSidebarOpen,
    getSidebarOpen,
    getServerSidebarOpen,
  );

  return (
    <TagNamesProvider tags={tagNames}>
      {/* .shell-inset carries the padding *and* the notch — see globals.css;
          it is where the 14px/8px breakpoint moved to. */}
      <div className="shell-inset flex h-dvh gap-[14px]">
        <aside
          // Width is the only thing that animates; the sidebar swaps to its
          // strip layout on the first frame. Cross-fading the contents as well
          // would draw the eye to the fold, which is the opposite of what
          // folding something away is for.
          className={`bg-paper hidden shrink-0 overflow-hidden rounded-[var(--radius-zone)] transition-[width] duration-200 ease-out motion-reduce:transition-none min-[1000px]:block ${
            sidebarOpen ? "w-60" : "w-[52px]"
          }`}
        >
          <Sidebar
            data={sidebar}
            collapsed={!sidebarOpen}
            onToggleCollapsed={toggleSidebarOpen}
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
              <Sidebar data={sidebar} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        {/* min-w-0 so a long title inside wraps instead of forcing this track
          wider than the viewport — the overflow bug that used to let stray
          characters escape the toolbar. */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-zone)]">
          {children}
        </main>

        {/* Bottom bar, touch only. The controls that live in the content header on
          a wide screen sit at thumb height here instead. */}
        <div className="glass lift-2 bar-inset fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-2 pt-2 min-[1000px]:hidden">
          {/* "Notes", not "Tags": the drawer is the whole sidebar — All notes,
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
            onClick={() => setSearchMenuOpen(true)}
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

        <SearchMenu
          tags={tagNames}
          open={searchMenuOpen}
          onOpenChange={setSearchMenuOpen}
        />

        {/* Mounted beside the search menu, and for the same reason: the window
            is the drop target, so this belongs to the shell rather than to any
            view inside it. ⌘K's "Import markdown files" opens the picker it
            owns. */}
        <NoteImport />

        {/* The confirmation ⌘K's "Log out" row asks for. Mounted here rather
            than in the sidebar so it survives the search menu closing behind
            it. */}
        <LogOutPrompt />

        {/* Both belong to the shell for the same reason the search menu does:
            one reports a condition the whole app is in, the other answers a
            shortcut that can land on any route. */}
        <OfflineToast />
        <SearchMenuLaunch />
      </div>
    </TagNamesProvider>
  );
}
