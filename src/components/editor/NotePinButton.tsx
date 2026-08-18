"use client";

import { useEffect, useState, useTransition } from "react";
import { setNotePinned } from "@/lib/notes/actions";
import { MAX_PINNED_NOTES } from "@/lib/notes/pins";

/**
 * Pin, to the left of the trash in the note's header.
 *
 * The two controls are a pair in shape and nothing else: same 28px circle,
 * same 16px glyph, but this one fills in the accent while it's on and the
 * other only ever reddens under the pointer. Pinning is a state the note is
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
}: {
  noteId: string;
  title: string;
  /** The stored state. Re-synced below whenever the server sends a new one. */
  pinned: boolean;
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
      const result = await setNotePinned({ id: noteId, pinned: next });
      // The server is the authority on both answers: it holds the cap, and a
      // refused pin has to snap the button back rather than leave it lit over
      // a note the rail isn't showing.
      setPinned(result.pinned);
      setFull(result.full);
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
        // --action, not --accent: the palette keeps orange for ambient things
        // (washes, bullets, links) and gives every clickable control --action,
        // so the two never compete for "this is actionable". Orange was also
        // the wrong side of the one distinction this header has to make —
        // burnt orange sits a few degrees off --danger, so the pin read as a
        // second, milder version of the trash beside it. Blue (amber in dark)
        // can't be mistaken for it in either theme.
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-action-wash hover:text-action ${
          pinned ? "bg-action-wash text-action" : "text-ink-faint"
        }`}
      >
        <PinIcon filled={pinned} />
      </button>

      {full && (
        <p
          role="status"
          className="absolute right-0 top-full z-40 mt-2 w-56 rounded-[var(--radius-zone)] border border-line bg-surface p-3 text-[13px] text-ink shadow-lg shadow-shade/20"
        >
          {MAX_PINNED_NOTES} notes are already pinned. Unpin one to make room
          for this.
        </p>
      )}
    </div>
  );
}

/* Drawn here, like the trash next to it: same 24-unit box and same stroke, so
   the pair reads as one set of controls. The head fills while the note is
   pinned — the outline alone was too quiet a difference at 16px to carry a
   state on its own, next to a neighbour that is never filled at all. */
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path
        d="M9 4h6l-.8 5.2 3 3.1V14H6.8v-1.7l3-3.1L9 4z"
        fill={filled ? "currentColor" : "none"}
      />
      <path d="M12 14v6" />
    </svg>
  );
}
