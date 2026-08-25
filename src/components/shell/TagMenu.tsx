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
  /**
   * The move itself belongs to the rail — see [Rail.moveProps]. Omitted by the
   * tag directory, which can't see the pinned section's order and so offers no
   * move items at all rather than two that are permanently greyed out.
   */
  onMove?: (direction: -1 | 1) => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
  /** Viewport coordinates of the row this was opened from. */
  x: number;
  y: number;
};

/**
 * The rail row's context menu — the one place any of a tag's settings live.
 *
 * Colour is in here and nowhere else on purpose. Tags are created by typing
 * `#thing` mid-sentence, and a colour prompt at that moment would turn writing
 * into configuring; the derived hue is always already right enough to carry
 * on. This is for the case where two tags you use constantly collided on the
 * same slot, which is a real annoyance and a rare one.
 */
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
        // The list is capped, so the control says why it's unavailable rather
        // than silently doing nothing on click.
        disabled={!pinned && pinnedCount >= MAX_PINNED_TAGS}
      >
        {pinned
          ? "Unpin"
          : pinnedCount >= MAX_PINNED_TAGS
            ? `Pinned tags are full (${MAX_PINNED_TAGS})`
            : "Pin to top"}
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

      {/* Below rename, because it is the same kind of thing done to the whole
          tag at once, and in --danger so the pair doesn't read as two spellings
          of the same press. The ellipsis is doing real work: what it opens
          asks which of the two deletions you meant before anything happens. */}
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

      {/* Shared with the index heading's dot — same swatches, same reset, one
          implementation. */}
      <div className="px-3 pb-1.5 pt-2.5">
        <TagHuePalette tag={tag} hue={hue} />
      </div>
    </ContextMenu>
  );
}
