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
import type { NoteOverviewLite } from "@/lib/notes/queries";
import type { TagPreferences } from "@/lib/tags/preferences";
import { TagNamesProvider } from "./TagNames";
import { TagPreferencesProvider } from "./TagPreferencesProvider";
import { LogOutPrompt } from "./LogOutPrompt";
import { NoteImport } from "./NoteImport";
import { Sidebar, type SidebarData } from "./Sidebar";
import { ListIcon, PlusIcon, SearchIcon } from "@/icons";

type Props = {
  sidebar: SidebarData;
  /** Every tag in use, flattened. The search menu's "jump to tag" list. */
  tagNames: string[];
  /** The stored pinned tags and hue overrides, seeding the client store. */
  tagPreferences: TagPreferences;
  /** Most-recent notes, so the search menu's Recent section loads at once. */
  recentNotes: NoteOverviewLite[];
  /** The routed page, rendered in the content area. */
  children: ReactNode;
};

/**
 * The shell both views share: a fixed sidebar and a flexing content area,
 * separated only by the gap.
 *
 * Below 1000px the sidebar is an overlay drawer and the controls move to a
 * bottom bar.
 */
export function AppShell({
  sidebar,
  tagNames,
  tagPreferences,
  recentNotes,
  children,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Outside React so scattered triggers can open it. See lib/search-menu/menu-state.
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
    // Outside [TagNamesProvider] so the seed is in place before anything below
    // reads the store, the sidebar's pinned section included.
    <TagPreferencesProvider stored={tagPreferences}>
      <TagNamesProvider tags={tagNames}>
        <div className="shell-inset flex h-full gap-[14px]">
          <aside
            // Width is the only thing that animates; the sidebar swaps to its
            // strip layout on the first frame.
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
                className="scrim drawer-scrim-enter absolute inset-0"
              />
              <div className="bg-paper lift-3 drawer-enter absolute inset-y-2 left-2 w-72 overflow-hidden rounded-[var(--radius-zone)]">
                <Sidebar data={sidebar} onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>
          )}

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-none min-[1000px]:rounded-[var(--radius-zone)]">
            {children}
          </main>

          {/* Bottom bar, touch only. The controls that live in the content header on
            a wide screen sit at thumb height here instead. */}
          <div className="glass lift-2 bar-inset fixed inset-x-0 z-30 flex items-center justify-around gap-1 pt-2 min-[1000px]:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="row-tint flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-3 text-ui-lg text-ink-muted"
            >
              <ListIcon aria-hidden className="icon shrink-0" />
              Menu
            </button>
            <button
              type="button"
              onClick={() => setSearchMenuOpen(true)}
              className="row-tint flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-3 text-ui-lg text-ink-muted"
            >
              <SearchIcon aria-hidden className="icon shrink-0" />
              Search
            </button>
            <Link
              href="/notes/new"
              className="row-tint flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-3 text-ui-lg text-ink-muted"
            >
              <PlusIcon aria-hidden className="icon shrink-0" />
              New note
            </Link>
          </div>

          <SearchMenu
            tags={tagNames}
            recentNotes={recentNotes}
            open={searchMenuOpen}
            onOpenChange={setSearchMenuOpen}
          />

          <NoteImport />

          <LogOutPrompt />

          <OfflineToast />

          <SearchMenuLaunch />

        </div>
      </TagNamesProvider>
    </TagPreferencesProvider>
  );
}
