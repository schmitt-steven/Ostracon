"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { setPaletteOpen } from "@/lib/command/palette-state";
import type { PinnedNote } from "@/lib/notes/queries";
import { flattenTree, type TagNode } from "@/lib/tags/tree";
import { tagAncestry } from "@/lib/tags/parse";
import {
  ALL_NOTES_HREF,
  tagFromSegments,
  tagHref,
  UNTAGGED_HREF,
} from "@/lib/tags/routes";
import { MAX_PINNED } from "@/lib/tags/preferences";
import { useTagHues } from "@/hooks/use-tag-hues";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
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

type MenuState = { tag: string; x: number; y: number };

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
 * The rail: search, pinned notes, the three places that aren't a tag, pinned
 * tags, and the tag tree.
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
  const { preferences, hueOf, isOverridden } = useTagHues();

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

  const pinned = preferences.pinned
    .slice(0, MAX_PINNED)
    .map((name) => byName.get(name))
    .filter((node) => node !== undefined);

  const toggleExpanded = useCallback(
    (name: string, open: boolean) => {
      setOverrides((current) => {
        const next = new Map(current);
        next.set(name, !open);
        return next;
      });
    },
    [],
  );

  function openMenu(tag: string, event: MouseEvent) {
    event.preventDefault();
    setMenu({ tag, x: event.clientX, y: event.clientY });
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
          onContextMenu={(event) => openMenu(node.name, event)}
          toggle={
            hasChildren ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
                onClick={() => toggleExpanded(node.name, open)}
                className="row-tint absolute -left-3.5 flex size-5 items-center justify-center rounded-[var(--radius-control)] text-ink-faint hover:text-ink-muted"
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
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Log out"
              title="Log out"
              className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:text-ink"
            >
              <LogOutIcon />
            </button>
          </form>
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

      {/* 1 — search, and under it the one thing you do instead of searching.

          Search first: notes, tags and verbs, all of it, one box.

          Right edge flush with the rows below, left edge 4px inside them. The
          asymmetry is deliberate and it is small: this is the only control in
          the rail that is drawn as a filled box at rest, and squared off hard
          against the panel's own edge it read as pinned to the wall rather
          than as sitting in the column with everything else. On the right,
          where the rows put their counts, flush is what lines up. */}
      <div className="pl-1">
        <SearchTrigger />
      </div>

      {/* Writing is the other half of what this app is for, and on a wide
          screen the only way into it was ⌘K and the word "new". It sits under
          search because searching is what you do on nine visits in ten — and
          it's drawn as a row on the tag rows' own left edge, not as a filled
          button 4px inside them, because the rail has exactly one box in it
          and that one is the field you type into. */}
      <Link
        href="/notes/new"
        className="row-tint mt-[var(--space-item)] flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-ink-muted hover:text-ink"
      >
        <PlusIcon />
        New note
      </Link>

      {/* 2 — the notes held out of the tree by hand.

          At the top, above even All notes: five rows at most (see
          [MAX_PINNED_NOTES]), so nothing below them moves far, and a pinned
          note is by definition the thing you came back for. The section is
          absent entirely while nothing is pinned rather than standing there
          empty — an empty heading would cost the same vertical space as two
          real rows and say less than the tag tree already does. */}
      {data.pinnedNotes.length > 0 && (
        <nav className="mt-[var(--space-group)]" aria-label="Pinned notes">
          <p className="px-2.5 pb-[var(--space-item)] text-[13px] text-ink-faint">
            Pinned notes
          </p>
          <ul className="flex flex-col gap-[var(--space-item)]">
            {data.pinnedNotes.map((note) => (
              <li key={note.slug}>
                {/* No count and no dot: a note is one thing, and a hue here
                    would be claiming the row is a tag. The title carries it,
                    truncated by the row like any other. */}
                <RailRow
                  href={`/notes/${note.slug}`}
                  label={note.title || "Untitled"}
                  selected={pathname === `/notes/${note.slug}`}
                />
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* 3 — the places that aren't a tag. Above the tags rather than under
          them: they are the three fixed destinations, they never grow, and at
          the foot of a long tree they sat below the fold on exactly the
          collections that most needed a way back out to everything. */}
      <nav
        className="mt-[var(--space-group)] flex flex-col gap-[var(--space-item)]"
        aria-label="Views"
      >
        <RailRow
          href={ALL_NOTES_HREF}
          label="All notes"
          count={data.allCount}
          selected={pathname === ALL_NOTES_HREF}
        />
        <RailRow
          href={UNTAGGED_HREF}
          label="Untagged"
          count={data.untaggedCount}
          selected={pathname === UNTAGGED_HREF}
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
        />
      </nav>

      {/* 4 — pinned tags. Named in full now that notes can be pinned too: two
          sections headed "Pinned" would be one word doing two jobs. */}
      {pinned.length > 0 && (
        <nav className="mt-[var(--space-group)]" aria-label="Pinned tags">
          <p className="px-2.5 pb-[var(--space-item)] text-[13px] text-ink-faint">
            Pinned tags
          </p>
          <ul className="flex flex-col gap-[var(--space-item)]">
            {pinned.map((node) => (
              <li key={node.name}>
                <RailRow
                  href={tagHref(node.name)}
                  label={node.name}
                  count={node.count}
                  hue={hueOf(node.name)}
                  child={node.name.includes("/")}
                  selected={activeTag === node.name}
                  onContextMenu={(event) => openMenu(node.name, event)}
                />
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* 5 — the tree, sorted by recent use */}
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
        <form action={logoutAction}>
          <button
            type="submit"
            className="row-tint flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1 text-left text-[13px] text-ink-muted hover:text-ink"
          >
            <LogOutIcon />
            Log out
          </button>
        </form>
      </div>

      {menu && (
        <TagMenu
          tag={menu.tag}
          x={menu.x}
          y={menu.y}
          pinned={preferences.pinned.includes(menu.tag)}
          pinnedCount={preferences.pinned.length}
          hue={hueOf(menu.tag)}
          overridden={isOverridden(menu.tag)}
          onRename={() => setRenaming(menu.tag)}
          onClose={() => setMenu(null)}
        />
      )}
      {renaming && (
        <TagRenameDialog tag={renaming} onClose={() => setRenaming(null)} />
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

function LogOutIcon() {
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
      <path d="M6.2 2.2H3.4a1.2 1.2 0 0 0-1.2 1.2v9.2a1.2 1.2 0 0 0 1.2 1.2h2.8" />
      <path d="M10.4 11.2 13.6 8l-3.2-3.2M13.6 8H6.2" />
    </svg>
  );
}
