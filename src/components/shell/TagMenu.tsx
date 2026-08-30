"use client";

import { MAX_PINNED_TAGS, togglePinned } from "@/lib/tags/preferences";
import { ContextMenu, menuItem } from "./ContextMenu";
import { TagHuePalette } from "./TagHuePalette";

type Props = {
  tag: string;
  pinned: boolean;
  pinnedCount: number;
  /** Current hue, override applied — what the swatch row shows as chosen. */
  hue: number;
  /** False at the top of the pinned section, which greys "Move up" out. */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** The move belongs to the rail (see [Rail.moveProps]); omitted by the tag
   * directory, which can't see the pinned order. */
  onMove?: (direction: -1 | 1) => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
  /** Viewport coordinates of the row this was opened from. */
  x: number;
  y: number;
};

/** The rail row's context menu — pin, move, rename, delete, and the hue
 * palette (its only home; a colour prompt at tag-creation would be too much). */
export function TagMenu({
  tag,
  pinned,
  pinnedCount,
  hue,
  canMoveUp,
  canMoveDown,
  onMove,
  onRename,
  onDelete,
  onClose,
  x,
  y,
}: Props) {
  return (
    <ContextMenu label={`#${tag}`} x={x} y={y} onClose={onClose}>
      <button
        type="button"
        role="menuitem"
        className={menuItem}
        onClick={() => {
          togglePinned(tag);
          onClose();
        }}
        // Capped — the item says why rather than doing nothing.
        disabled={!pinned && pinnedCount >= MAX_PINNED_TAGS}
      >
        {pinned
          ? "Unpin from the sidebar"
          : pinnedCount >= MAX_PINNED_TAGS
            ? `Pinned tags are full (${MAX_PINNED_TAGS})`
            : "Pin to the sidebar"}
      </button>

      {pinned && onMove && (
        <>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          >
            Move up
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            Move down
          </button>
        </>
      )}

      <button
        type="button"
        role="menuitem"
        className={menuItem}
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        Rename everywhere…
      </button>

      {/* Below rename, in --danger; the ellipsis opens the two-deletions dialog. */}
      <button
        type="button"
        role="menuitem"
        className={`${menuItem} text-danger! hover:text-danger-hover!`}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        Delete tag…
      </button>

      {/* Shared with the index heading's dot. */}
      <div className="px-3 pb-1.5 pt-2.5">
        <TagHuePalette tag={tag} hue={hue} />
      </div>
    </ContextMenu>
  );
}
