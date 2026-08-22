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
  /** The move itself belongs to the rail — see [Rail.moveProps]. */
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
  /** Viewport coordinates of the row this was opened from. */
  x: number;
  y: number;
};

/**
 * A pinned note row's context menu — unpin, and move within the section.
 *
 * It exists because pinning was reachable only from the note's own header, so
 * taking a note out of the rail meant opening the note you were trying to stop
 * looking at. Right-clicking the row is where anyone would try first — and now
 * that pinned notes and pinned tags are one section, a right-click that worked
 * on half the rows and not the other half read as the menu being broken rather
 * than as the rows being different.
 *
 * The two move items are the same two the tag rows have, moving the row
 * through the same single list, so a note and a tag can be put either side of
 * each other. Unpinning is the one thing here that reaches the server: which
 * notes are pinned is a column, while where they sit is not.
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
          // No local pressed state to keep honest, unlike the header's pin
          // button: this row is drawn from the server's list, so the
          // revalidation the action triggers is what makes it disappear.
          startTransition(async () => {
            const result = await setNotePinned({ id, pinned: false });
            // The column is only half of it: the row's place in the section is
            // a key in the browser, and leaving it behind would put the note
            // back where it was if it is ever pinned again.
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
