"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import icon from "@/assets/ostracon-icon.png";
import { setSearchMenuOpen } from "@/lib/search-menu/menu-state";
import { scopeFromPath, scopePrompt } from "@/lib/search-menu/scope";
import type { PinnedNote } from "@/lib/notes/queries";
import { flattenTree, type TagNode } from "@/lib/tags/tree";
import { sortByPinOrder } from "@/lib/tags/pin-order";
import {
  ALL_NOTES_HREF,
  noteHref,
  tagFromSegments,
  tagHref,
  TAGS_HREF,
} from "@/lib/tags/routes";
import {
  isNotePinKey,
  MAX_PINNED_TAGS,
  notePinKey,
  setPinnedOrder,
  tagPinKey,
} from "@/lib/tags/preferences";
import {
  GearIcon,
  ImagesIcon,
  NotesIcon,
  PanelLeftFilledIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  TagIcon,
} from "@/icons";
import { useTagHues } from "@/hooks/use-tag-hues";
import { LogOutButton } from "./LogOutButton";
import { NoteMenu } from "./NoteMenu";
import { SidebarRow } from "./SidebarRow";
import { SearchTrigger } from "./SearchTrigger";
import { TagMenu } from "./TagMenu";
import { TagDeleteDialog } from "./TagDeleteDialog";
import { TagRenameDialog } from "./TagRenameDialog";
import { UpdateRow } from "./UpdateRow";

export type SidebarData = {
  /** At most MAX_PINNED_NOTES, in the order they were pinned. */
  pinnedNotes: PinnedNote[];
  tree: TagNode[];
  tagCount: number;
  allCount: number;
  imageCount: number;
};

// One menu at a time — the kind is part of the row it opened from.
type MenuState =
  | { kind: "tag"; tag: string; x: number; y: number }
  | { kind: "note"; note: PinnedNote; x: number; y: number };

/** Where a menu was asked for, in viewport coordinates. */
type Point = { x: number; y: number };

/** Which row a menu belongs to (its pin key) — for the ⋯ toggle. */
function menuRowKey(state: MenuState) {
  return state.kind === "tag"
    ? tagPinKey(state.tag)
    : notePinKey(state.note.slug);
}

// One row of each pinned section, both carrying the pin key [sortByPinOrder] sorts on.
type NotePin = { key: string; note: PinnedNote };
type TagPin = { key: string; node: TagNode };

type Props = {
  data: SidebarData;
  /** Called on any click inside, so the touch drawer closes behind a link. */
  onNavigate?: () => void;
  /** Wide screens only: folded down to the icon strip. */
  collapsed?: boolean;
  /** Absent in the touch drawer, which has no folded state to get to. */
  onToggleCollapsed?: () => void;
};

/**
 * The sidebar: search, the four non-tag places, then hand-pinned notes and
 * hand-pinned tags. The full tag tree moved to /tags ([TagDirectory]) — it
 * outgrew a 240px column — leaving one "All tags" row. No filter field either;
 * ⌘K took over searching. Sections are separated by --space-group alone.
 * Folded, it's the same column with the lists removed.
 */
export function Sidebar({
  data,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
  const pathname = usePathname();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { preferences, hueOf } = useTagHues();

  // Which tag the route is showing, from the pathname — a pinned tag's row
  // lights up when you're inside it.
  const activeTag = pathname.startsWith("/t/")
    ? tagFromSegments(pathname.slice(3).split("/"))
    : null;

  // The route as the search menu reads it — for the folded strip's search
  // button.
  const sidebarScope = scopeFromPath(pathname);

  // The tree isn't drawn here, but pinned tags are looked up in it for counts.
  const flat = useMemo(() => flattenTree(data.tree), [data.tree]);

  const byName = useMemo(
    () => new Map(flat.map((node) => [node.name, node])),
    [flat],
  );

  const pinnedTags = preferences.pinned
    .slice(0, MAX_PINNED_TAGS)
    .map((name) => byName.get(name))
    .filter((node) => node !== undefined);

  // Two sections, one stored order read twice — each ignores keys not its own
  // (see [sortByPinOrder]).
  const pinnedNoteItems = sortByPinOrder<NotePin>(
    data.pinnedNotes.map((note) => ({ key: notePinKey(note.slug), note })),
    preferences.order,
  );

  const pinnedTagItems = sortByPinOrder<TagPin>(
    pinnedTags.map((node) => ({ key: tagPinKey(node.name), node })),
    preferences.order,
  );

  /** The section a row lives in — the only one its move items can reach. */
  function sectionOf(key: string): { key: string }[] {
    return isNotePinKey(key) ? pinnedNoteItems : pinnedTagItems;
  }

  /**
   * What either menu needs for its move items — whether there's anywhere to go
   * (within the row's own section), and how. Only this component knows.
   */
  function moveProps(key: string) {
    const section = sectionOf(key);
    const index = section.findIndex((item) => item.key === key);
    return {
      canMoveUp: index > 0,
      canMoveDown: index !== -1 && index < section.length - 1,
      onMove: (direction: -1 | 1) => movePinnedItem(key, direction),
    };
  }

  // One step inside one section; both sequences are written back, since
  // [setPinnedOrder] replaces the stored order outright.
  function movePinnedItem(key: string, direction: -1 | 1) {
    const keys = sectionOf(key).map((item) => item.key);
    const index = keys.indexOf(key);
    const next = index + direction;
    if (index === -1 || next < 0 || next >= keys.length) return;
    [keys[index], keys[next]] = [keys[next]!, keys[index]!];

    const moved = isNotePinKey(key);
    const others = (moved ? pinnedTagItems : pinnedNoteItems).map(
      (item) => item.key,
    );
    setPinnedOrder(moved ? [...keys, ...others] : [...others, ...keys]);
  }

  // Both the right-click and the ⋯ button end here. A second press from the
  // same row closes it (the ⋯ toggle).
  function openMenu(next: MenuState) {
    setMenu((current) =>
      current && menuRowKey(current) === menuRowKey(next) ? null : next,
    );
  }

  function openTagMenu(tag: string, at: Point) {
    openMenu({ kind: "tag", tag, ...at });
  }

  function openNoteMenu(note: PinnedNote, at: Point) {
    openMenu({ kind: "note", note, ...at });
  }

  /** The pointer's own position, and no browser menu on top of ours. */
  function pointerPoint(event: MouseEvent): Point {
    event.preventDefault();
    return { x: event.clientX, y: event.clientY };
  }

  // Folded: the same px-3 py-4 column with the named rows (views, pins)
  // dropped — search + New note at top, settings + log out at the foot.
  if (collapsed && onToggleCollapsed) {
    return (
      <div className="flex h-full flex-col items-start gap-[var(--space-item)] px-3 py-4">
        <FoldButton collapsed onClick={onToggleCollapsed} />
        <button
          type="button"
          onClick={() => setSearchMenuOpen(true)}
          // The strip's [SearchTrigger] — the label states the scope.
          aria-label={
            sidebarScope
              ? `${scopePrompt(sidebarScope)}…`
              : "Search, do, or jump to…"
          }
          aria-keyshortcuts="Meta+K Control+K"
          className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:text-ink"
        >
          <SearchIcon aria-hidden className="size-3.5 shrink-0" />
        </button>
        <Link
          href="/notes/new"
          aria-label="New note"
          className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:text-ink"
        >
          <PlusIcon aria-hidden className="size-3.5 shrink-0" />
        </Link>

        <div className="mt-auto flex flex-col items-start gap-[var(--space-item)]">
          <UpdateRow compact />
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={`row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] hover:text-ink ${
              pathname === "/settings" ? "text-ink" : "text-ink-muted"
            }`}
          >
            <GearIcon aria-hidden className="size-3.5 shrink-0" />
          </Link>
          <LogOutButton compact />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-3 py-4"
      onClick={onNavigate}
    >
      {/* Wordmark left, fold control right. */}
      {onToggleCollapsed && (
        <div className="mb-[calc(var(--space-item)*2)] -mr-1.5 flex items-center justify-between">
          {/* Wordmark is the way back to All notes. */}
          <Link
            href={ALL_NOTES_HREF}
            aria-label="All notes"
            aria-current={pathname === ALL_NOTES_HREF ? "page" : undefined}
            className="group flex select-none items-center gap-2 font-display text-[19px] font-bold leading-none text-ink [paint-order:stroke] [-webkit-text-stroke:3px_transparent] transition-[-webkit-text-stroke-color] duration-200 hover:[-webkit-text-stroke-color:var(--color-line)] motion-reduce:transition-none"
          >
            <Image
              src={icon}
              alt=""
              aria-hidden
              className="size-6 shrink-0 transition duration-500 ease-out group-hover:[filter:drop-shadow(1px_0_0_var(--color-line))_drop-shadow(-1px_0_0_var(--color-line))_drop-shadow(0_1px_0_var(--color-line))_drop-shadow(0_-1px_0_var(--color-line))] motion-safe:group-hover:rotate-[360deg] motion-reduce:duration-200"
            />
            Ostracon
          </Link>
          <FoldButton collapsed={false} onClick={onToggleCollapsed} />
        </div>
      )}

      {/* Search, flush with the rows below (its box carries its own padding). */}
      <SearchTrigger />

      {/* New note + the three non-tag places: four fixed rows, one section
          under search, above the pins (which grow). New note is a [SidebarRow],
          not a button — the sidebar has one box and it's the search field. */}
      <nav
        className="mt-[var(--space-item)] flex flex-col gap-[var(--space-item)]"
        aria-label="Views"
      >
        <SidebarRow
          href="/notes/new"
          label="New note"
          selected={pathname === "/notes/new"}
          icon={<PlusIcon className="size-3.5 shrink-0" />}
        />
        <SidebarRow
          href={ALL_NOTES_HREF}
          label="All notes"
          count={data.allCount}
          selected={pathname === ALL_NOTES_HREF}
          icon={<NotesIcon className="size-3.5 shrink-0" />}
        />
        {/* Where the tag tree went (see [TagDirectory]). The count is every
            tag at every depth. Untagged is now a link under the All notes
            heading. */}
        <SidebarRow
          href={TAGS_HREF}
          label="All tags"
          count={data.tagCount}
          selected={pathname === TAGS_HREF}
          icon={<TagIcon className="size-3.5 shrink-0" />}
        />
        {/* Counted from note bodies, not the bucket — listing blob storage
            would be a round trip on every page. */}
        <SidebarRow
          href="/images"
          label="Images"
          count={data.imageCount}
          selected={pathname === "/images"}
          icon={<ImagesIcon className="size-3.5 shrink-0" />}
        />
      </nav>

      {/* The hand-pinned notes, then the hand-pinned tags — separate
          sections so a pinned note can't push a daily tag down the list. Each
          capped at five ([MAX_PINNED_NOTES] / [MAX_PINNED_TAGS]); absent while
          empty. */}
      {pinnedNoteItems.length > 0 && (
        <nav className="mt-[var(--space-group)]" aria-label="Pinned notes">
          <p className="px-2.5 pb-[var(--space-item)] text-[13px] text-ink-faint">
            Pinned notes
          </p>
          <ul className="flex flex-col gap-[var(--space-item)]">
            {pinnedNoteItems.map((item) => (
              <li key={item.key}>
                {/* No count, no `from` — the note opens under its own first tag. */}
                <SidebarRow
                  href={noteHref(item.note.slug)}
                  label={item.note.title || "Untitled"}
                  selected={pathname === noteHref(item.note.slug)}
                  onContextMenu={(event) =>
                    openNoteMenu(item.note, pointerPoint(event))
                  }
                  onOpenMenu={(at) => openNoteMenu(item.note, at)}
                  menuOpen={
                    menu?.kind === "note" && menu.note.slug === item.note.slug
                  }
                />
              </li>
            ))}
          </ul>
        </nav>
      )}

      {pinnedTagItems.length > 0 && (
        <nav className="mt-[var(--space-group)]" aria-label="Pinned tags">
          <p className="px-2.5 pb-[var(--space-item)] text-[13px] text-ink-faint">
            Pinned tags
          </p>
          <ul className="flex flex-col gap-[var(--space-item)]">
            {pinnedTagItems.map((item) => (
              <li key={item.key}>
                <SidebarRow
                  href={tagHref(item.node.name)}
                  label={item.node.name}
                  count={item.node.count}
                  hue={hueOf(item.node.name)}
                  child={item.node.name.includes("/")}
                  selected={activeTag === item.node.name}
                  onContextMenu={(event) =>
                    openTagMenu(item.node.name, pointerPoint(event))
                  }
                  onOpenMenu={(at) => openTagMenu(item.node.name, at)}
                  menuOpen={menu?.kind === "tag" && menu.tag === item.node.name}
                />
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* mt-auto pins this to the foot. Settings is a [SidebarRow] (a place
          now), where the theme toggle used to be — one row for all preferences.
          The update row sits above it, absent almost always. */}
      <div className="mt-auto flex flex-col gap-[var(--space-item)] pt-[var(--space-group)]">
        {/* Only ever drawn when there is one, and only until it's waved away. */}
        <UpdateRow />
        <SidebarRow
          href="/settings"
          label="Settings"
          selected={pathname === "/settings"}
          icon={<GearIcon className="size-3.5 shrink-0" />}
        />
        <LogOutButton />
      </div>

      {menu?.kind === "tag" && (
        <TagMenu
          tag={menu.tag}
          x={menu.x}
          y={menu.y}
          pinned={preferences.pinned.includes(menu.tag)}
          pinnedCount={preferences.pinned.length}
          hue={hueOf(menu.tag)}
          {...moveProps(tagPinKey(menu.tag))}
          onRename={() => setRenaming(menu.tag)}
          onDelete={() => setDeleting(menu.tag)}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.kind === "note" && (
        <NoteMenu
          id={menu.note.id}
          title={menu.note.title || "Untitled"}
          x={menu.x}
          y={menu.y}
          {...moveProps(notePinKey(menu.note.slug))}
          onClose={() => setMenu(null)}
        />
      )}
      {renaming && (
        <TagRenameDialog
          tag={renaming}
          // The tree node's count — "this tag and everything beneath it".
          noteCount={byName.get(renaming)?.count ?? 0}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <TagDeleteDialog
          tag={deleting}
          // The same subtree count.
          noteCount={byName.get(deleting)?.count ?? 0}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/**
 * Folds the sidebar away and brings it back — the same control in both states,
 * in the same place, with the panel glyph filling on the side that's showing.
 * Two separate buttons would have meant the one you press to reopen appearing
 * somewhere the one you pressed to close never was.
 */
function FoldButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  const Glyph = collapsed ? PanelLeftIcon : PanelLeftFilledIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show the sidebar" : "Hide the sidebar"}
      title={collapsed ? "Show the sidebar" : "Hide the sidebar"}
      className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-faint hover:text-ink-muted"
    >
      <Glyph aria-hidden className="size-4" />
    </button>
  );
}
