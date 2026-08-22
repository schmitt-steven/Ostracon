"use client";

import { useEffect, useState, useTransition } from "react";
import { PinIcon } from "@/components/ui/PinIcon";
import { setNotePinned } from "@/lib/notes/actions";
import { MAX_PINNED_NOTES } from "@/lib/notes/pins";
import { forgetPin, notePinKey, recordPin } from "@/lib/tags/preferences";

/**
 * Pin, to the left of the trash in the note's header.
 *
 * The two controls are a pair in shape and nothing else: same 28px circle,
 * same 16px glyph, but this one seats itself in neutral ink while it's on and
 * the other only ever reddens under the pointer. Pinning is a state the note is
 * in, so the button has to be able to show it at rest — a control you press
 * to find out what it did would be the wrong shape for something reversible.
 *
 * The pressed state is local rather than read back from the server on every
 * render: the action re-renders the route (which is how the rail's section
 * appears), but that lands a moment later, and a pin that stays unfilled until
 * the round trip completes reads as a press that didn't take.
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
  /**
   * False while the editor around this button is sitting under a URL it swapped
   * in itself, having just created the note. The action then skips the refresh
   * that would otherwise put the rail's pinned section up to date — and would
   * take the half-written note down with it. The local state below is what
   * keeps the button honest in the meantime.
   */
  canRefreshShell: boolean;
}) {
  const [pinned, setPinned] = useState(serverPinned);
  const [full, setFull] = useState(false);
  const [saving, startTransition] = useTransition();

  const name = title || "Untitled";

  // The row can also change from outside this button — unpinned from another
  // tab, or a refresh landing after some other edit — and the prop is the only
  // news of it. Assigning during render (rather than in an effect) so the
  // corrected state paints in the same frame as the prop arrives.
  const [lastServerPinned, setLastServerPinned] = useState(serverPinned);
  if (serverPinned !== lastServerPinned) {
    setLastServerPinned(serverPinned);
    setPinned(serverPinned);
  }

  // The "five already" notice is a statement about the moment it was pressed,
  // so it goes away by itself rather than sitting there until it's dismissed.
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
      // The server is the authority on both answers: it holds the cap, and a
      // refused pin has to snap the button back rather than leave it lit over
      // a note the rail isn't showing.
      setPinned(result.pinned);
      setFull(result.full);
      // Where the row goes is the browser's half of a pin (see [recordPin]),
      // and it follows what actually happened rather than what was pressed: a
      // pin the cap refused must not claim the top of the section.
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
        // Same reason as the trash's: the header names no note out loud.
        aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
        aria-pressed={pinned}
        title={pinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
        disabled={saving}
        onClick={toggle}
        // Neutral, not coloured. The header has exactly one colour to spend and
        // the trash beside it has it: --danger, meaning "this one is the
        // irreversible one". Any second hue here — the burnt orange this had
        // first, the blue that replaced it — is read against that red before
        // it's read on its own terms, so at 28px it landed as a milder version
        // of its neighbour rather than as a different kind of thing.
        //
        // So the pin borrows the rail's neutral pair instead: .row-tint for
        // "under the pointer" and .row-selected for "on", the same two steps of
        // translucent ink a selected rail row is drawn with. Translucent rather
        // than a fixed grey, which is what lets one declaration serve both
        // themes — dark ink over paper, pale ink over the dark surface.
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
