"use client";

import Link from "next/link";
import { useMemo, useState, type MouseEvent } from "react";
import { PaneScroller } from "@/components/shell/PaneScroller";
import { TagMenu } from "@/components/shell/TagMenu";
import { TagDeleteDialog } from "@/components/shell/TagDeleteDialog";
import { TagRenameDialog } from "@/components/shell/TagRenameDialog";
import { HeaderSearchButton } from "@/components/ui/HeaderSearchButton";
import { RelativeDate } from "@/components/ui/RelativeDate";
import { SortControl } from "@/components/ui/SortControl";
import { useTagHues } from "@/hooks/use-tag-hues";
import { tagHref, UNTAGGED_HREF } from "@/lib/tags/routes";
import { flattenTree, type TagNode } from "@/lib/tags/tree";
import {
  sortTagTree,
  TAG_SORT_LABEL,
  TAG_SORT_MODES,
  type TagSortMode,
} from "./tag-sort";
import { DotsIcon } from "@/icons";

type Props = {
  tree: TagNode[];
  /** Every tag at every depth — the tree's node count. */
  tagCount: number;
  /** How many notes carry at least one of them. */
  taggedCount: number;
  /** And how many carry none, which is the other half of the same fact. */
  untaggedCount: number;
};

/**
 * View C — every tag there is.
 *
 * This exists because the rail could not keep doing it. A tag tree in a 240px
 * column is fine at eight tags and unreadable at thirty: the rows the list
 * grows are exactly the rows that push the rest below the fold, so the more
 * tags you have — the more you'd want an overview — the less of one you get,
 * and finding a name means scrolling the rail while the thing you were reading
 * sits still beside it.
 *
 * A view that only moved those rows across would be a worse rail. So this one
 * says what the rail couldn't afford the width to: when each tag was last
 * written in, and, for a nested tag, the whole path rather than the leaf its
 * indent implied. The recency is not decoration — it is the default sort, and
 * an order the reader can't see the reason for reads as no order at all.
 *
 * **One column, in the same 680px measure as the index.** Two columns was the
 * first attempt and it was wrong twice over: CSS columns run down the left
 * before continuing at the top of the right, so an alphabetical list appeared
 * to be in no order — the eye reads across, and nothing but whitespace marked
 * where the column ended — while eight tags in two stacks of four left a canyon
 * down the middle.
 *
 * What's left is the index's row, and deliberately so: a tag name is a title in
 * the display face at the same size a note title is, the date sits at the same
 * right edge, and this view lines up with the one you came from instead of
 * being a third idea of what a list looks like. Only the vertical rhythm is
 * this view's own — a tag is one line where a note is two, so the rows sit
 * closer together than --space-row and a family's children sit closer still.
 *
 * There is no filter field. It would be the third box on screen that looks
 * like a search and isn't one, and ⌘K already takes a name and offers the tag
 * as somewhere to go — this view is for the case where you don't have a name
 * to type. The heading's
 * [HeaderSearchButton] is the door back out of that case, and it is a door to
 * the palette rather than a field of this view's own.
 */
export function TagDirectory({
  tree,
  tagCount,
  taggedCount,
  untaggedCount,
}: Props) {
  const { preferences, hueOf } = useTagHues();
  const [sort, setSort] = useState<TagSortMode>("recent");
  const [menu, setMenu] = useState<{
    tag: string;
    x: number;
    y: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const sorted = useMemo(() => sortTagTree(tree, sort), [tree, sort]);

  const byName = useMemo(
    () => new Map(flattenTree(tree).map((node) => [node.name, node])),
    [tree],
  );

  // Same rule as the rail's rows: a second press on the same row's ⋯ closes
  // what it opened, and a right-click always opens at the pointer.
  function openMenu(tag: string, at: { x: number; y: number }) {
    setMenu((current) =>
      current && current.tag === tag ? null : { tag, ...at },
    );
  }

  function renderNode(node: TagNode, depth: number): React.ReactNode {
    return (
      // Families are what the gaps separate: a root stands a clear step below
      // the family above it, and its own children sit just off it.
      <li
        key={node.name}
        className={depth === 0 ? "mt-3 first:mt-0" : "mt-0.5"}
      >
        <TagRow
          node={node}
          depth={depth}
          hue={hueOf(node.name)}
          menuOpen={menu?.tag === node.name}
          onOpenMenu={(at) => openMenu(node.name, at)}
        />
        {node.children.length > 0 && (
          <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    // No wash vars: the directory is about all the tags at once, so lighting it
    // in any one tag's hue would be the pane claiming something untrue. `.pane`
    // falls back to the neutral palette, as the gallery does.
    <div className="pane pane-etched h-full">
      <PaneScroller
        head={
          <header className="pane-head">
            <div className="mx-auto flex min-h-[var(--head-h)] max-w-[680px] items-center gap-4 px-6 py-4">
              {/* Not a breadcrumb. `All notes / Tags` was one, and it filed
                  the tags under the notes — they are two views of the same
                  collection, neither inside the other, and the rail lists them
                  side by side. What's left is the name of the place, which is
                  the name the rail's row and the heading below both use. */}
              {/* No left padding, unlike the breadcrumbs this stands in for:
                  there is no pill here to hang outside the column, so the word
                  starts where the heading below starts. */}
              <p className="min-w-0 flex-1 truncate pr-1.5 text-[13px] text-ink">
                All tags
              </p>
              {/* Nothing to order in an empty collection. */}
              {tagCount > 0 && (
                <SortControl
                  value={sort}
                  modes={TAG_SORT_MODES}
                  labels={TAG_SORT_LABEL}
                  label="Sort tags"
                  onChange={setSort}
                />
              )}
            </div>
          </header>
        }
      >
        <div className="mx-auto max-w-[680px] px-6 pb-24">
          <div className="pt-2">
            {/* The heading row carries the same magnifier the note lists do —
                this view is the one you land on without a name in mind, and
                the moment you do have one, ⌘K is the answer. Standing next to
                the title rather than up in the header bar keeps it where the
                index's is, one object in the same place on every overview. */}
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 flex-1 font-display text-[28px] font-medium leading-tight text-ink">
                All tags
              </h1>
              {/* Tags first, because that is the order the palette opens in
                  from here — it comes up wearing the All tags chip, which
                  leads with tags and keeps the notes below them. */}
              <HeaderSearchButton
                label="Search tags and notes"
                hint="Tags first, then notes"
              />
            </div>
            <p className="mt-[var(--space-hair)] text-[13px] text-ink-muted">
              {tagCount} {tagCount === 1 ? "tag" : "tags"} across {taggedCount}{" "}
              {taggedCount === 1 ? "note" : "notes"}
              {/* The rest of the collection, named on the one page that is
                  about how it's filed. A number that only appears in the rail
                  is a number you don't think about. */}
              {untaggedCount > 0 && (
                <>
                  <span aria-hidden className="px-1.5 text-ink-faint">
                    ·
                  </span>
                  <Link
                    href={UNTAGGED_HREF}
                    className="text-action underline-offset-2 hover:underline"
                  >
                    {untaggedCount} untagged
                  </Link>
                </>
              )}
            </p>
          </div>

          {tagCount === 0 ? (
            <p className="pt-[var(--space-block)] text-base text-ink-muted">
              No tags yet — add one to a note with its “+ tag” button.
            </p>
          ) : (
            <ul className="pt-[var(--space-block)]">
              {sorted.map((root) => renderNode(root, 0))}
            </ul>
          )}
        </div>

        <p className="sr-only" role="status">
          Sorted by {TAG_SORT_LABEL[sort]}
        </p>
      </PaneScroller>

      {menu && (
        <TagMenu
          tag={menu.tag}
          x={menu.x}
          y={menu.y}
          pinned={preferences.pinned.includes(menu.tag)}
          pinnedCount={preferences.pinned.length}
          hue={hueOf(menu.tag)}
          // No move items: the order of the pinned section is the rail's to
          // know, and this view can't see it. Pinning from here still works —
          // the row lands at the top of that section, as it does from the
          // tag's own page.
          onRename={() => setRenaming(menu.tag)}
          onDelete={() => setDeleting(menu.tag)}
          onClose={() => setMenu(null)}
        />
      )}
      {renaming && (
        <TagRenameDialog
          tag={renaming}
          // The node's count, which is already "this tag and everything
          // beneath it" — the same set the rename rewrites.
          noteCount={byName.get(renaming)?.count ?? 0}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <TagDeleteDialog
          tag={deleting}
          // As above — already "this tag and everything beneath it", which is
          // the set the delete reaches either way it goes.
          noteCount={byName.get(deleting)?.count ?? 0}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/**
 * One tag: dot, name, count, when it was last written in, and the same ⋯ menu
 * its rail row used to carry.
 *
 * The name is the index row's title — display face, 16px, medium — because a
 * tag is a heading over a pile of notes and the two lists sit one click apart.
 * The count sits against it rather than at the right edge: held out there it
 * belonged to nothing, a `1` with 300px of pane between it and the word it
 * counts being a number the eye has to walk back along the row to attach. The
 * date keeps the right edge, where the index's date is.
 *
 * A child prints its leaf, as the rail's rows did — `test`, not `vercel/test`.
 * The parent is the row directly above it, one indent out, in the full ink the
 * child doesn't get and with the larger of the two dots; a family here is
 * never split across a column or a fold, so the row above is always the answer
 * to "under what?". Repeating the path would spend the widest part of every
 * child row restating it.
 */
function TagRow({
  node,
  depth,
  hue,
  menuOpen,
  onOpenMenu,
}: {
  node: TagNode;
  depth: number;
  hue: number;
  menuOpen: boolean;
  onOpenMenu: (at: { x: number; y: number }) => void;
}) {
  const root = depth === 0;

  return (
    <div
      // No row-tint-host: that class exists to light a row from a hover
      // anywhere on it, and with the menu standing permanently in its own lane
      // the two targets here light separately, each under its own pointer.
      className="relative flex items-center"
      style={{ paddingLeft: depth * 14 }}
    >
      <Link
        href={tagHref(node.name)}
        onContextMenu={(event: MouseEvent) => {
          event.preventDefault();
          onOpenMenu({ x: event.clientX, y: event.clientY });
        }}
        style={{ "--h": hue } as React.CSSProperties}
        // py-1.5 rather than the index's --space-row between rows: the title is
        // the same size, but a tag is one line where a note is a title over a
        // snippet, so the same air around it would be twice the pitch for half
        // the content.
        // The index's bleed, spelled out rather than taken from `.bleed-row`:
        // the name starts on the heading's own left edge and the tint reaches
        // 12px past it either way, so the list doesn't stand 8px in from the
        // title above it.
        //
        // Spelled out because the right side isn't symmetrical here: pr-11
        // holds a 24px lane clear for the ⋯ button, which stands in it
        // permanently, leaving 8px between the date and its glyph. That
        // asymmetry can't be layered on top of the class — `.bleed-row` sets
        // `padding-inline` in an unlayered rule, which silently outranks any
        // utility trying to override it, whatever order the classes are
        // written in. (The at-rest transition it also carries comes from
        // `.hue-row`, which is in the same selector list.)
        className="hue-row -mx-3 flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-control)] py-1.5 pl-3 pr-11"
      >
        <span
          aria-hidden
          className={`shrink-0 rounded-full ${
            root ? "hue-dot size-[7px]" : "hue-dot-child size-[5px]"
          }`}
        />
        <span
          className={`min-w-0 truncate font-display text-base font-medium ${
            root ? "text-ink" : "text-ink-muted"
          }`}
        >
          {node.leaf}
        </span>
        {/* Against the name, dimmed, and at the metadata size rather than the
            title's — a count is about the name, not part of it. */}
        <span className="shrink-0 tabular-nums text-[13px] text-ink-faint">
          {node.count}
        </span>
        {/* Why the default order is the order it is. It keeps its place under
            the pointer: the menu has a lane of its own, so nothing here has to
            get out of the way of anything. */}
        <RelativeDate
          date={node.lastUsed}
          className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-ink-faint"
        />
      </Link>

      {/* Outside the link — a button inside an anchor isn't markup — and in
          the lane the row's right padding holds open for it, just past the
          date.

          Always drawn, unlike the rail's, which appears under the pointer. In
          the rail it was one of forty rows in a column you read past; here it
          is the only way to a tag's colour, its name and its pin from the one
          page that lists every tag, and a control you have to hover a row to
          discover is a control most people never find. Quiet enough at
          --ink-faint that a column of them reads as punctuation. */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Options for #${node.name}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          // Anchored to the button, not the pointer: from the keyboard there
          // are no coordinates to anchor to.
          const box = event.currentTarget.getBoundingClientRect();
          onOpenMenu({ x: box.right - 4, y: box.bottom + 4 });
        }}
        className={`row-tint absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-150 hover:text-ink motion-reduce:transition-none ${
          menuOpen ? "text-ink" : "text-ink-faint"
        }`}
      >
        <DotsIcon aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
