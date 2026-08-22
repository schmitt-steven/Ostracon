"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { setPaletteOpen } from "@/lib/command/palette-state";
import type { PinnedNote } from "@/lib/notes/queries";
import { flattenTree, type TagNode } from "@/lib/tags/tree";
import { tagAncestry } from "@/lib/tags/parse";
import { sortByPinOrder } from "@/lib/tags/pin-order";
import {
  ALL_NOTES_HREF,
  noteHref,
  tagFromSegments,
  tagHref,
  UNTAGGED_HREF,
} from "@/lib/tags/routes";
import {
  MAX_PINNED_TAGS,
  notePinKey,
  setPinnedOrder,
  tagPinKey,
} from "@/lib/tags/preferences";
import { useTagHues } from "@/hooks/use-tag-hues";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { LogOutButton } from "./LogOutButton";
import { NoteMenu } from "./NoteMenu";
import { RailRow } from "./RailRow";
import { SearchTrigger } from "./SearchTrigger";
import { TagMenu } from "./TagMenu";
import { TagRenameDialog } from "./TagRenameDialog";

export type RailData = {
  /** At most MAX_PINNED_NOTES, in the order they were pinned. */
  pinnedNotes: PinnedNote[];
  tree: TagNode[];
  tagCount: number;
  allCount: number;
  untaggedCount: number;
  imageCount: number;
};

// One menu at a time, and which one is a property of the row it was opened
// from rather than of two independent pieces of state that could both be set.
type MenuState =
  | { kind: "tag"; tag: string; x: number; y: number }
  | { kind: "note"; note: PinnedNote; x: number; y: number };

/** Where a menu was asked for, in viewport coordinates. */
type Point = { x: number; y: number };

/**
 * Which row a menu belongs to. The pin keys already name a row uniquely across
 * both kinds, so they serve here too — and what this answers is whether a
 * second press on the ⋯ button is the same row asking again, which is what
 * makes that button close what it opened.
 */
function menuRowKey(state: MenuState) {
  return state.kind === "tag"
    ? tagPinKey(state.tag)
    : notePinKey(state.note.slug);
}

/** One row of the pinned section, whichever of the two kinds it is. */
type PinnedItem =
  | { key: string; kind: "note"; note: PinnedNote }
  | { key: string; kind: "tag"; node: TagNode };

type Props = {
  data: RailData;
  /** Called on any click inside, so the touch drawer closes behind a link. */
  onNavigate?: () => void;
  /** Wide screens only: folded down to the icon strip. */
  collapsed?: boolean;
  /** Absent in the touch drawer, which has no folded state to get to. */
  onToggleCollapsed?: () => void;
};

/**
 * The rail: search, the three places that aren't a tag, the notes and tags
 * pinned by hand, and the tag tree.
 *
 * It had a "Filter tags" field at the top until ⌘K took over searching. Two
 * field-shaped controls stacked, one narrowing this list and one searching
 * everything, is a distinction no layout can draw — and the palette already
 * finds a tag by name, either as somewhere to go or, after `#`, as a scope to
 * search inside. The field itself is kept in ./TagFilterField, unmounted.
 *
 * Sections are separated by --space-group and nothing else — no rules, no
 * headings in caps, no boxes. The eye reads four groups here purely from the
 * fact that the gaps between them are three and a half times the gaps inside
 * them.
 *
 * Folded, it is the same column with the tag list taken out: search and New
 * note at the top, theme and log out at the foot, each on the left edge it
 * already had. The fold reads as the panel narrowing around its controls
 * rather than as a different bar appearing — and nothing that was reachable
 * in one click becomes reachable only by unfolding first.
 */
export function Rail({
  data,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
  const pathname = usePathname();
  // Explicit open/closed decisions only. Whether a row is actually open is
  // derived below — a row on the path to the active tag starts open without
  // anything being stored, and this map is what lets you then close it.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const { preferences, hueOf } = useTagHues();

  // Which tag (if any) the current route is showing. Read from the pathname
  // rather than threaded down from the page, so the rail doesn't need every
  // route to remember to tell it.
  const activeTag = pathname.startsWith("/t/")
    ? tagFromSegments(pathname.slice(3).split("/"))
    : null;

  // The active tag's ancestors are open for you — arriving at `#infra/ci` from
  // a link, only to find the rail showing a collapsed `#infra` with no
  // indication of where you are, is the one case where "collapsed by default"
  // is actively unhelpful.
  //
  // Derived rather than pushed into state on navigation: as state it would
  // need an effect to keep up with the route, and an effect that sets state is
  // a render that happens for the second time to say the same thing.
  const onPath = useMemo(
    () => new Set(activeTag ? tagAncestry(activeTag) : []),
    [activeTag],
  );

  const isOpen = useCallback(
    (name: string) => overrides.get(name) ?? onPath.has(name),
    [overrides, onPath],
  );

  const flat = useMemo(() => flattenTree(data.tree), [data.tree]);

  const byName = useMemo(
    () => new Map(flat.map((node) => [node.name, node])),
    [flat],
  );

  const pinnedTags = preferences.pinned
    .slice(0, MAX_PINNED_TAGS)
    .map((name) => byName.get(name))
    .filter((node) => node !== undefined);

  // The section is one list, so it has one order — see [sortByPinOrder], and
  // [setPinnedOrder] for why the stored one lives where it does. Notes before
  // tags is only the fallback arrival order, and it decides nothing while
  // pinning names each row as it arrives: both halves are already newest
  // first, so the two interleave by when they were pinned rather than by kind.
  const pinnedItems = sortByPinOrder<PinnedItem>(
    [
      ...data.pinnedNotes.map((note): PinnedItem => ({
        key: notePinKey(note.slug),
        kind: "note",
        note,
      })),
      ...pinnedTags.map((node): PinnedItem => ({
        key: tagPinKey(node.name),
        kind: "tag",
        node,
      })),
    ],
    preferences.order,
  );

  /**
   * What either menu needs to draw its two move items: whether there is
   * anywhere to go, and how to go there. Whether a row is at an end of the
   * section is something only this component knows, so the menus are told
   * rather than left to press a control that does nothing — which is what the
   * section did when the two halves were ordered separately.
   */
  function moveProps(key: string) {
    const index = pinnedItems.findIndex((item) => item.key === key);
    return {
      canMoveUp: index > 0,
      canMoveDown: index !== -1 && index < pinnedItems.length - 1,
      onMove: (direction: -1 | 1) => movePinnedItem(key, direction),
    };
  }

  /**
   * One step, and the whole sequence is written back — the rail is the only
   * place that can see both halves of the section at once.
   */
  function movePinnedItem(key: string, direction: -1 | 1) {
    const keys = pinnedItems.map((item) => item.key);
    const index = keys.indexOf(key);
    const next = index + direction;
    if (index === -1 || next < 0 || next >= keys.length) return;
    [keys[index], keys[next]] = [keys[next]!, keys[index]!];
    setPinnedOrder(keys);
  }

  const toggleExpanded = useCallback((name: string, open: boolean) => {
    setOverrides((current) => {
      const next = new Map(current);
      next.set(name, !open);
      return next;
    });
  }, []);

  /**
   * Both ways into a row's menu — the right-click and the row's own ⋯ button —
   * end here, differing only in where they aim it. A second press from the
   * same row closes it again, which is what the button needs to be a toggle;
   * the right-click can't reach that case, since the press that opens the
   * menu dismisses any open one before the contextmenu event is even sent.
   */
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

  function renderNode(node: TagNode, depth: number): React.ReactNode {
    const open = isOpen(node.name);
    const hasChildren = node.children.length > 0;

    return (
      <li key={node.name}>
        <RailRow
          href={tagHref(node.name)}
          label={node.leaf}
          count={node.count}
          hue={hueOf(node.name)}
          child={depth > 0}
          selected={activeTag === node.name}
          depth={depth}
          onContextMenu={(event) => openTagMenu(node.name, pointerPoint(event))}
          onOpenMenu={(at) => openTagMenu(node.name, at)}
          menuOpen={menu?.kind === "tag" && menu.tag === node.name}
          toggle={
            hasChildren ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
                onClick={() => toggleExpanded(node.name, open)}
                // row-toggle is what the row's own hover tint watches for, so
                // that the pointer resting here lights the chevron alone —
                // see .row-tint-host in globals.
                className="row-tint row-toggle absolute -left-3.5 flex size-5 items-center justify-center rounded-[var(--radius-control)] text-ink-faint hover:text-ink-muted"
                style={{ left: depth * 14 - 14 }}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 12 12"
                  className={`size-2.5 transition-transform duration-200 motion-reduce:transition-none ${
                    open ? "rotate-90" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m4 2 4 4-4 4" />
                </svg>
              </button>
            ) : undefined
          }
        />
        {hasChildren && open && (
          <ul className="mt-[var(--space-item)] flex flex-col gap-[var(--space-item)]">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  // Folded: the same px-3 py-4 column, so the fold control doesn't travel.
  // Everything the expanded rail keeps outside the tag list comes with it —
  // search and New note at the top, theme and log out held at the foot by the
  // same mt-auto. Only the tags themselves are gone, which is the one thing
  // the strip has no way to show and the whole reason for folding it.
  if (collapsed && onToggleCollapsed) {
    return (
      <div className="flex h-full flex-col items-start gap-[var(--space-item)] px-3 py-4">
        <FoldButton collapsed onClick={onToggleCollapsed} />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search or jump to…"
          aria-keyshortcuts="Meta+K Control+K"
          className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:text-ink"
        >
          <SearchIcon />
        </button>
        <Link
          href="/notes/new"
          aria-label="New note"
          className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:text-ink"
        >
          <PlusIcon />
        </Link>

        <div className="mt-auto flex flex-col items-start gap-[var(--space-item)]">
          <ThemeToggle compact />
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
      {/* 0 — the fold control, on its own line above everything. Left-aligned
          with the rail's padding rather than with the rows, which is what
          keeps it in place when the panel narrows to the strip. */}
      {onToggleCollapsed && (
        <div className="mb-[var(--space-item)]">
          <FoldButton collapsed={false} onClick={onToggleCollapsed} />
        </div>
      )}

      {/* 1 — search, on its own above everything the rail lists.

          Search first: notes, tags and verbs, all of it, one box.

          Both edges flush with the rows below. It was inset 4px on the left
          for a while, on the theory that the rail's one filled box wanted a
          little air against the panel edge — but the box carries its own
          padding, so all the inset actually bought was a magnifier standing
          7px right of the column of marks it belongs to and a name 9px right
          of every other name. One left edge for the whole rail is the thing
          the eye is reading; a box is allowed to sit on it. */}
      <SearchTrigger />

      {/* 2 — New note and the three places that aren't a tag: four fixed rows,
          one section directly under search.

          They were two groups a --space-group apart, which spent the rail's
          largest gap separating four rows that are all the same thing — the
          part of the rail that is always there, in the same order, whatever
          you have written or pinned. The gap belongs between *that* and the
          lists below, and it now falls only there.

          Writing first: it's the other half of what this app is for, and it
          goes under search rather than over it because searching is what you
          do on nine visits in ten. It's a row and not a filled button because
          the rail has exactly one box in it and that one is the field you type
          into — and being a row, it's a [RailRow], so its name starts on the
          same left edge as the three under it instead of 7px further in.

          Above the pinned section rather than below it: these four are fixed
          and never grow, so they sit at a height that doesn't depend on how
          many notes and tags you happen to have pinned this month. Everything
          below them is a list the user's own choices decide the length of. */}
      <nav
        className="mt-[var(--space-item)] flex flex-col gap-[var(--space-item)]"
        aria-label="Views"
      >
        <RailRow
          href="/notes/new"
          label="New note"
          selected={pathname === "/notes/new"}
          icon={<PlusIcon />}
        />
        <RailRow
          href={ALL_NOTES_HREF}
          label="All notes"
          count={data.allCount}
          selected={pathname === ALL_NOTES_HREF}
          icon={<NotesIcon />}
        />
        <RailRow
          href={UNTAGGED_HREF}
          label="Untagged"
          count={data.untaggedCount}
          selected={pathname === UNTAGGED_HREF}
          icon={<UntaggedIcon />}
        />
        {/* Counted from the note bodies, not from the bucket: listing blob
            storage is a network round trip the rail would then be making on
            every page, and the gallery shows the images *in the notes*
            anyway. The two can disagree by one in a single case — a note
            still pointing at an upload that has since left the bucket, which
            this counts and the gallery doesn't show. */}
        <RailRow
          href="/images"
          label="Images"
          count={data.imageCount}
          selected={pathname === "/images"}
          icon={<ImagesIcon />}
        />
      </nav>

      {/* 3 — everything held out of the tree by hand, notes and tags in one
          section.

          They were two sections with two headings, which spent a heading and a
          --space-group gap to draw a line the rows themselves already draw:
          the dot. A pinned note takes the neutral bullet (a coloured dot would
          be claiming the row is a tag) and a pinned tag keeps its own hue.

          One list all the way down, not two stacked: the two kinds interleave
          in whatever order they were put in, because "the four things I am
          working on" is a real grouping and "all my notes, then all my tags"
          isn't one anybody asked for. Each half is capped at five (see
          [MAX_PINNED_NOTES] and [MAX_PINNED_TAGS]), so the section is ten rows
          at the very worst and nothing below it ever moves far.

          Absent entirely while nothing is pinned rather than standing there
          empty — an empty heading would cost the same vertical space as two
          real rows and say less than the tag tree already does. */}
      {pinnedItems.length > 0 && (
        <nav
          className="mt-[var(--space-group)]"
          aria-label="Pinned notes and tags"
        >
          <p className="px-2.5 pb-[var(--space-item)] text-[13px] text-ink-faint">
            Pinned notes &amp; tags
          </p>
          <ul className="flex flex-col gap-[var(--space-item)]">
            {pinnedItems.map((item) =>
              item.kind === "note" ? (
                <li key={item.key}>
                  {/* No count: a note is one thing. No `from` either — the
                      pinned list is held out of the tree on purpose and isn't
                      an index into any one tag, so the note opens under its
                      own first tag. */}
                  <RailRow
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
              ) : (
                <li key={item.key}>
                  <RailRow
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
                    menuOpen={
                      menu?.kind === "tag" && menu.tag === item.node.name
                    }
                  />
                </li>
              ),
            )}
          </ul>
        </nav>
      )}

      {/* 4 — the tree, sorted by recent use */}
      {data.tree.length > 0 && (
        <nav className="mt-[var(--space-group)]" aria-label="All tags">
          <p className="px-2.5 pb-[var(--space-item)] text-[13px] text-ink-faint">
            All tags · {data.tagCount}
          </p>
          <ul className="flex flex-col gap-[var(--space-item)] pl-3.5">
            {data.tree.map((node) => renderNode(node, 0))}
          </ul>
        </nav>
      )}

      {/* mt-auto pins this to the bottom of the rail however short the tag
          list is; the gap above it is the same --space-group as everywhere. */}
      <div className="mt-auto flex flex-col gap-[var(--space-item)] pt-[var(--space-group)]">
        <ThemeToggle />
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
          // The tree node's count, which is already "this tag and everything
          // beneath it" — the same set the rename rewrites.
          noteCount={byName.get(renaming)?.count ?? 0}
          onClose={() => setRenaming(null)}
        />
      )}
    </div>
  );
}

/**
 * Folds the rail away and brings it back — the same control in both states,
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show the sidebar" : "Hide the sidebar"}
      title={collapsed ? "Show the sidebar" : "Hide the sidebar"}
      className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-faint hover:text-ink-muted"
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2.75" width="12" height="10.5" rx="2" />
        <path d="M6.25 2.75v10.5" />
        {/* The column that stands for the rail is filled while the rail is
            showing and empty while it isn't, so the glyph is a picture of the
            current state rather than of what pressing it would do. */}
        {!collapsed && (
          <path
            d="M6.25 2.75H4a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2h2.25z"
            fill="currentColor"
            stroke="none"
            opacity="0.35"
          />
        )}
      </svg>
    </button>
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

/**
 * The three fixed views, drawn at the same 1.3 stroke on the same 16 box as
 * every other glyph in the rail, so a row's mark reads as part of one set
 * rather than as three borrowed pictures.
 */
function NotesIcon() {
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
      <path d="M4.6 2.4h4.3L12.4 5.9v6.7a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1V3.4a1 1 0 0 1 1-1z" />
      <path d="M8.9 2.4v3.5h3.5" />
    </svg>
  );
}

function UntaggedIcon() {
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
      {/* A tag, struck through on the diagonal that crosses its long axis —
          the other diagonal runs along the tag and would have read as part of
          the shape rather than as a negation of it. */}
      <path d="M9 2.6h3.4a1 1 0 0 1 1 1V7a1 1 0 0 1-.3.7l-5 5a1 1 0 0 1-1.4 0L3 9a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 .7-.3z" />
      <path d="M10.9 5.1h.01" strokeWidth="1.6" />
      <path d="M3.1 3.1 12.9 12.9" />
    </svg>
  );
}

function ImagesIcon() {
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
      <rect x="2.4" y="3.2" width="11.2" height="9.6" rx="1.6" />
      <circle cx="6" cy="6.4" r="1.05" />
      <path d="m2.6 11.5 2.9-2.8a1.2 1.2 0 0 1 1.7 0l3.4 3.3" />
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
