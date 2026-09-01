"use client";

import { useEffect, useState, useTransition } from "react";
import { PinIcon } from "@/components/ui/PinIcon";
import { setNotePinned } from "@/lib/notes/actions";
import { MAX_PINNED_NOTES } from "@/lib/notes/pins";
import { forgetPin, notePinKey, recordPin } from "@/lib/tags/preferences";

/**
 * Pin, left of the trash in the note's header. Seats itself in neutral ink
 * while on (pinning is a state, shown at rest). Pressed state is local, since
 * the route re-render that shows the sidebar section lands a moment later.
 */
export function NotePinButton({
  noteId,
  title,
  pinned: serverPinned,
  canRefreshShell,
}: {
  noteId: string;
  title: string;
  /** The stored state. Re-synced below whenever the server sends a new one. */
  pinned: boolean;
  /** False while the editor sits under a URL it swapped in itself — the action
   * then skips the refresh (which would tear the editor down); local state
   * keeps the button honest. */
  canRefreshShell: boolean;
}) {
  const [pinned, setPinned] = useState(serverPinned);
  const [full, setFull] = useState(false);
  const [saving, startTransition] = useTransition();

  const name = title || "Untitled";

  // Re-sync to the prop (unpinned from another tab, a refresh) during render,
  // so the correction paints in the same frame.
  const [lastServerPinned, setLastServerPinned] = useState(serverPinned);
  if (serverPinned !== lastServerPinned) {
    setLastServerPinned(serverPinned);
    setPinned(serverPinned);
  }

  // The "five already" notice auto-dismisses.
  useEffect(() => {
    if (!full) return;
    const timer = setTimeout(() => setFull(false), 4000);
    return () => clearTimeout(timer);
  }, [full]);

  function toggle() {
    const next = !pinned;
    setPinned(next);
    setFull(false);
    startTransition(async () => {
      const result = await setNotePinned({
        id: noteId,
        pinned: next,
        canRefreshShell,
      });
      // The server holds the cap — a refused pin snaps the button back.
      setPinned(result.pinned);
      setFull(result.full);
      // The row's position is the browser's half of a pin (see [recordPin]),
      // following what happened, not what was pressed.
      if (result.slug !== null) {
        const key = notePinKey(result.slug);
        if (result.pinned) recordPin(key);
        else forgetPin(key);
      }
    });
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        // The header names no note out loud.
        aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
        aria-pressed={pinned}
        title={pinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
        disabled={saving}
        onClick={toggle}
        // Neutral, not coloured — the header's one colour (--danger) belongs to
        // the trash. Borrows the sidebar's translucent .row-tint /
        // .row-selected.
        className={`row-tint flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-ink ${
          pinned ? "row-selected text-ink" : "text-ink-faint"
        }`}
      >
        <PinIcon filled={pinned} />
      </button>

      {full && (
        <p
          role="status"
          className="glass lift-2 absolute right-0 top-full z-40 mt-2 w-56 rounded-[var(--radius-zone)] p-3 text-[13px] text-ink"
        >
          {MAX_PINNED_NOTES} notes are already pinned. Unpin one to make room
          for this.
        </p>
      )}
    </div>
  );
}
