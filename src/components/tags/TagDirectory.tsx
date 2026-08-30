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
  /** How many notes carry at least one tag. */
  taggedCount: number;
  /** How many carry none. */
  untaggedCount: number;
};

/**
 * Every tag there is — the overview the rail's 240px column couldn't hold.
 * Adds what the rail lacked width for: each tag's last-used date (the default
 * sort) and, for a nested tag, its full path. One column in the index's 680px
 * measure, drawn as the index's row (display-face title, right-edge date),
 * just tighter vertically. No filter field — ⌘K covers the by-name case; this
 * view is for when you don't have a name to type.
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

  // A second press on the same ⋯ closes it; right-click opens at the pointer.
  function openMenu(tag: string, at: { x: number; y: number }) {
    setMenu((current) =>
      current && current.tag === tag ? null : { tag, ...at },
    );
  }

  function renderNode(node: TagNode, depth: number): React.ReactNode {
    return (
      // Gaps separate families — a root steps below the family above, children
      // sit just off it.
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
    // No wash vars — the directory is about all tags at once; neutral `.pane`.
    <div className="pane pane-etched h-full">
      <PaneScroller
        head={
          <header className="pane-head">
            <div className="mx-auto flex min-h-[var(--head-h)] max-w-[680px] items-center gap-4 px-6 py-4">
              {/* Not a breadcrumb — tags aren't filed under notes. */}
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
            {/* The same magnifier the note lists carry, next to the title. */}
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 flex-1 font-display text-[28px] font-medium leading-tight text-ink">
                All tags
              </h1>
              {/* Tags first — the palette opens wearing the All tags chip. */}
              <HeaderSearchButton
                label="Search tags and notes"
                hint="Tags first, then notes"
              />
            </div>
            <p className="mt-[var(--space-hair)] text-[13px] text-ink-muted">
              {tagCount} {tagCount === 1 ? "tag" : "tags"} across {taggedCount}{" "}
              {taggedCount === 1 ? "note" : "notes"}
              {/* The rest of the collection, on the page about how it's filed. */}
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
          // No move items — the pinned section's order is the rail's to know.
          onRename={() => setRenaming(menu.tag)}
          onDelete={() => setDeleting(menu.tag)}
          onClose={() => setMenu(null)}
        />
      )}
      {renaming && (
        <TagRenameDialog
          tag={renaming}
          // The node's count — already "this tag and everything beneath it".
          noteCount={byName.get(renaming)?.count ?? 0}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <TagDeleteDialog
          tag={deleting}
          // As above.
          noteCount={byName.get(deleting)?.count ?? 0}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/**
 * One tag: dot, name (the index row's display-face title), count against the
 * name, last-used date at the right edge, and its ⋯ menu. A child prints its
 * leaf; its parent is the row directly above, one indent out.
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
      // No row-tint-host — the two targets (row, menu) light separately.
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
        // py-1.5 (tighter than the index's --space-row — a tag is one line).
        // The bleed is spelled out, not `.bleed-row`, because the right side is
        // asymmetric: pr-11 holds a lane clear for the ⋯ button.
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
        {/* Against the name, dimmed, at metadata size — about the name. */}
        <span className="shrink-0 tabular-nums text-[13px] text-ink-faint">
          {node.count}
        </span>
        {/* The default sort key; keeps its place (the menu has its own lane). */}
        <RelativeDate
          date={node.lastUsed}
          className="ml-auto shrink-0 whitespace-nowrap text-[13px] text-ink-faint"
        />
      </Link>

      {/* Outside the link (no button inside an anchor), in the lane pr-11
          holds. Always drawn, unlike the rail's — this is the only way to a
          tag's options from here. Quiet at --ink-faint. */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Options for #${node.name}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          // Anchored to the button — the keyboard has no coordinates.
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
