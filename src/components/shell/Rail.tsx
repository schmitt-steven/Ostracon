"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import { setPaletteOpen } from "@/lib/command/palette-state";
import { scopeFromPath, scopePrompt } from "@/lib/command/scope";
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
import { RailRow } from "./RailRow";
import { SearchTrigger } from "./SearchTrigger";
import { TagMenu } from "./TagMenu";
import { TagDeleteDialog } from "./TagDeleteDialog";
import { TagRenameDialog } from "./TagRenameDialog";

export type RailData = {
  /** At most MAX_PINNED_NOTES, in the order they were pinned. */
  pinnedNotes: PinnedNote[];
  tree: TagNode[];
  tagCount: number;
  allCount: number;
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

// One row of each pinned section. Both carry the pin key [sortByPinOrder]
// sorts on; what they carry besides it is what their own row needs and nothing
// the other one does.
type NotePin = { key: string; note: PinnedNote };
type TagPin = { key: string; node: TagNode };

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
 * The rail: search, the four places that aren't a tag, then the notes pinned
 * by hand and the tags pinned by hand. Fixed height at the top, two short
 * lists under it, and that is the whole panel.
 *
 * **The tag tree used to be here and isn't.** Every tag in the collection,
 * nested, sorted by recent use, growing a row per tag forever — which works
 * until about a dozen tags and then quietly stops. Past that the list runs off
 * the bottom of a 240px column, so finding a name means scrolling the rail
 * while the thing you were reading sits still beside it, and the tags you use
 * least are the ones you have to hunt for hardest. The rows are now one row,
 * "All tags", pointing at /tags — see [TagDirectory], which shows the same
 * tree in the reading pane where there is width for two columns of it. What
 * stays in the rail is what a rail is good at: a fixed set of places, plus the
 * handful of tags you said out loud you wanted here.
 *
 * It had a "Filter tags" field at the top until ⌘K took over searching. Two
 * field-shaped controls stacked, one narrowing this list and one searching
 * everything, is a distinction no layout can draw — and the palette already
 * finds a tag by name, either as somewhere to go or, after `#`, as a scope to
 * search inside.
 *
 * Sections are separated by --space-group and nothing else — no rules, no
 * headings in caps, no boxes. The eye reads the groups here purely from the
 * fact that the gaps between them are three and a half times the gaps inside
 * them.
 *
 * Folded, it is the same column with the lists taken out: search and New note
 * at the top, settings and log out at the foot, each on the left edge it
 * already had. The fold reads as the panel narrowing around its controls rather than
 * as a different bar appearing.
 */
export function Rail({
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

  // Which tag (if any) the current route is showing. Read from the pathname
  // rather than threaded down from the page, so the rail doesn't need every
  // route to remember to tell it. Still needed with the tree gone: a pinned
  // tag's row is the one that lights up when you are inside it.
  const activeTag = pathname.startsWith("/t/")
    ? tagFromSegments(pathname.slice(3).split("/"))
    : null;

  // The same route, read as the palette reads it — for the strip's search
  // button, which is [SearchTrigger] with nothing left but its label.
  const railScope = scopeFromPath(pathname);

  // The tree isn't drawn here any more, but it is still what the pinned tags
  // are looked up in — a pin stores a name, and the row needs the node's count.
  const flat = useMemo(() => flattenTree(data.tree), [data.tree]);

  const byName = useMemo(
    () => new Map(flat.map((node) => [node.name, node])),
    [flat],
  );

  const pinnedTags = preferences.pinned
    .slice(0, MAX_PINNED_TAGS)
    .map((name) => byName.get(name))
    .filter((node) => node !== undefined);

  // Two sections, two sequences — but one stored order, which names rows of
  // both kinds (see [sortByPinOrder]) and is simply read twice. Keys for the
  // other kind are names this half doesn't contain, and an order is allowed to
  // name things that aren't there, so each section sorts by the positions its
  // own rows were given and ignores the rest.
  const pinnedNoteItems = sortByPinOrder<NotePin>(
    data.pinnedNotes.map((note) => ({ key: notePinKey(note.slug), note })),
    preferences.order,
  );

  const pinnedTagItems = sortByPinOrder<TagPin>(
    pinnedTags.map((node) => ({ key: tagPinKey(node.name), node })),
    preferences.order,
  );

  /**
   * The section a row lives in — the only one its move items can reach. Only
   * the keys are wanted here, which is the one thing the two kinds share.
   */
  function sectionOf(key: string): { key: string }[] {
    return isNotePinKey(key) ? pinnedNoteItems : pinnedTagItems;
  }

  /**
   * What either menu needs to draw its two move items: whether there is
   * anywhere to go, and how to go there. Whether a row is at an end of its
   * section is something only this component knows, so the menus are told
   * rather than left to press a control that does nothing.
   *
   * The ends are the ends of that row's own section: a note can't be moved
   * past the last note into the tags below, because the two are separate lists
   * and the rail draws them in a fixed order.
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

  /**
   * One step inside one section, and *both* sequences are written back —
   * [setPinnedOrder] replaces the stored order outright, so passing only the
   * half that moved would drop the other half's positions.
   */
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

  // Folded: the same px-3 py-4 column, so the fold control doesn't travel.
  // The two things you press without reading come with it — search and New
  // note at the top, settings and log out held at the foot by the same
  // mt-auto.
  // What the strip drops is everything that is a *name*: the views, the pins.
  // A 52px column has no room for a word, and an icon per place would be four
  // glyphs nobody can tell apart standing in for four rows that were already
  // legible — which is what unfolding is one click away for.
  if (collapsed && onToggleCollapsed) {
    return (
      <div className="flex h-full flex-col items-start gap-[var(--space-item)] px-3 py-4">
        <FoldButton collapsed onClick={onToggleCollapsed} />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          // The strip's version of [SearchTrigger], and it says the same thing
          // — the words are all that is left of that control here, so they are
          // the last place the scope could still be stated before the click.
          aria-label={
            railScope ? `${scopePrompt(railScope)}…` : "Search, do, or jump to…"
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
      {/* 0 — the wordmark on the left, the fold control pushed to the far right.
          The name holds the rail's left padding; the button rides the opposite
          edge here and snaps back to that same left padding once the panel
          narrows to the strip and the name is gone.

          The -mr negative margin cancels the button's own centring gutter — its
          glyph is 6px in from a 28px hit area — so the icon itself lands flush
          with the rail's content edge whether or not the hover tint is showing. */}
      {onToggleCollapsed && (
        <div className="mb-[calc(var(--space-item)*2)] -mr-1.5 flex items-center justify-between">
          <span className="select-none font-display text-[19px] font-bold leading-none text-ink">
            Ostracon
          </span>
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
          icon={<PlusIcon className="size-3.5 shrink-0" />}
        />
        <RailRow
          href={ALL_NOTES_HREF}
          label="All notes"
          count={data.allCount}
          selected={pathname === ALL_NOTES_HREF}
          icon={<NotesIcon className="size-3.5 shrink-0" />}
        />
        {/* Where the tag tree went. Directly under All notes because the two
            are the same kind of thing — the two ways into the whole
            collection, one by note and one by tag.

            The count is every tag at every depth, the same number the tree's
            heading printed, so the row says how much is behind it before you
            press it.

            Untagged used to sit under this one and is now a link in the line
            under the All notes heading, beside the one the tag directory has
            carried for a while. It is a corner of the collection rather than a
            view of it — this row's own reason for standing where it does — and
            as a fixed row it was the one entry here that read `0` forever once
            you had caught up. The line only appears while there is something
            in it. See [IndexView]. */}
        <RailRow
          href={TAGS_HREF}
          label="All tags"
          count={data.tagCount}
          selected={pathname === TAGS_HREF}
          icon={<TagIcon className="size-3.5 shrink-0" />}
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
          icon={<ImagesIcon className="size-3.5 shrink-0" />}
        />
      </nav>

      {/* 3 and 4 — everything held out of the tree by hand: the notes, then
          the tags, each its own section under its own heading.

          They shared one section for a while, on the theory that "the four
          things I am working on" is the real grouping and the dot already says
          which kind each row is. In practice the two kinds don't behave alike
          — a note row opens one document and a tag row opens a list, and only
          one of them carries a count — so a mixed list made you read every row
          to find the one you meant, and pinning a note could push a tag you
          use daily three rows down. Two headings cost one line each and buy
          back a fixed place for both kinds: the notes are always the first
          block, the tags always the second.

          Notes above tags because a pinned note is the more specific thing —
          one destination rather than a filter over many — and because the tags
          sit closest to the fixed views' own tag rows above them.

          Each is capped at five (see [MAX_PINNED_NOTES] and [MAX_PINNED_TAGS])
          so neither block ever grows far, and either is absent entirely while
          its half is empty rather than standing there as a heading over
          nothing. */}
      {pinnedNoteItems.length > 0 && (
        <nav className="mt-[var(--space-group)]" aria-label="Pinned notes">
          <p className="px-2.5 pb-[var(--space-item)] text-[13px] text-ink-faint">
            Pinned notes
          </p>
          <ul className="flex flex-col gap-[var(--space-item)]">
            {pinnedNoteItems.map((item) => (
              <li key={item.key}>
                {/* No count: a note is one thing. No `from` either — the
                    pinned list is held out of the tree on purpose and isn't an
                    index into any one tag, so the note opens under its own
                    first tag. */}
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
                  menuOpen={menu?.kind === "tag" && menu.tag === item.node.name}
                />
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* mt-auto pins this to the bottom of the rail however short the pinned
          list is; the gap above it is the same --space-group as everywhere.

          Settings stands where the theme toggle used to. A rail row per
          preference doesn't scale — the theme was the first of them and would
          not have been the last — so the foot of the rail holds one row that
          goes to *all* of them, and the theme switch itself lands in that
          page's Appearance section. It is a [RailRow] like the views above
          rather than a button, because it is a place now. */}
      <div className="mt-auto flex flex-col gap-[var(--space-item)] pt-[var(--space-group)]">
        <RailRow
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
          // The tree node's count, which is already "this tag and everything
          // beneath it" — the same set the rename rewrites.
          noteCount={byName.get(renaming)?.count ?? 0}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <TagDeleteDialog
          tag={deleting}
          // The same subtree count the rename dialog takes, and the same set:
          // deleting a tag reaches everything beneath it.
          noteCount={byName.get(deleting)?.count ?? 0}
          onClose={() => setDeleting(null)}
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
