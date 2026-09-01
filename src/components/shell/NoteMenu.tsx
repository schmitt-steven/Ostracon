"use client";

import { useTransition } from "react";
import { setNotePinned } from "@/lib/notes/actions";
import { forgetPin, notePinKey } from "@/lib/tags/preferences";
import { ContextMenu, menuItem } from "./ContextMenu";

type Props = {
  /** The note the row stands for; the id is what the unpin addresses. */
  id: string;
  title: string;
  /** False at the top of the pinned section, which greys "Move up" out. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** The move itself belongs to the sidebar — see [Sidebar.moveProps]. */
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
  /** Viewport coordinates of the row this was opened from. */
  x: number;
  y: number;
};

/**
 * A pinned note row's context menu — unpin, and move within the section (the
 * same single list the tag rows move through). Unpinning is the one thing here
 * that reaches the server.
 */
export function NoteMenu({
  id,
  title,
  canMoveUp,
  canMoveDown,
  onMove,
  onClose,
  x,
  y,
}: Props) {
  const [saving, startTransition] = useTransition();

  return (
    <ContextMenu label={title} x={x} y={y} onClose={onClose}>
      <button
        type="button"
        role="menuitem"
        className={menuItem}
        disabled={saving}
        onClick={() => {
          // No local pressed state — the action's revalidation removes the row.
          startTransition(async () => {
            const result = await setNotePinned({ id, pinned: false });
            // Also drop the browser-held order key.
            if (result.slug !== null) forgetPin(notePinKey(result.slug));
            onClose();
          });
        }}
      >
        Unpin
      </button>
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
    </ContextMenu>
  );
}
