"use client";

import { useEffect, useState } from "react";
import { PinIcon } from "@/components/ui/PinIcon";
import { useTagHues } from "@/hooks/use-tag-hues";
import { MAX_PINNED_TAGS, togglePinned } from "@/lib/tags/preferences";

/**
 * Pin, at the right-hand end of a tag index's heading row.
 *
 * The note editor's header has had one of these all along and a tag's index
 * hasn't, which left pinning a tag reachable only by right-clicking its row in
 * the rail — the one place you have to already suspect it exists. The page the
 * tag is *about* is where the thought "I'm in here a lot" actually occurs.
 *
 * Same shape as [NotePinButton] and the same neutral pair of tints, because it
 * is the same verb about the other kind of pinnable thing. No local optimism
 * here, though: pinning a tag is a synchronous write to localStorage and the
 * store notifies in the same tick, so the state this renders is already the
 * stored one — there is no round trip to be ahead of.
 */
export function TagPinButton({ tag }: { tag: string }) {
  const { preferences } = useTagHues();
  const [full, setFull] = useState(false);

  const pinned = preferences.pinned.includes(tag);
  const noRoom = !pinned && preferences.pinned.length >= MAX_PINNED_TAGS;

  // Same as the note's: the notice is a statement about the moment it was
  // pressed, so it leaves by itself rather than sitting there until dismissed.
  useEffect(() => {
    if (!full) return;
    const timer = setTimeout(() => setFull(false), 4000);
    return () => clearTimeout(timer);
  }, [full]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={pinned ? `Unpin #${tag}` : `Pin #${tag}`}
        aria-pressed={pinned}
        title={pinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
        onClick={() => {
          // The store silently drops anything past the cap, so the cap is
          // checked here — a press that appears to do nothing is worse than
          // one that says why it can't.
          if (noRoom) {
            setFull(true);
            return;
          }
          setFull(false);
          togglePinned(tag);
        }}
        className={`row-tint flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-ink ${
          pinned ? "row-selected text-ink" : "text-ink-faint"
        }`}
      >
        <PinIcon filled={pinned} />
      </button>

      {full && (
        <p
          role="status"
          // font-* restated: this hangs off the heading row, which is display
          // type at 28px.
          className="glass lift-2 absolute right-0 top-full z-40 mt-2 w-56 rounded-[var(--radius-zone)] p-3 font-sans text-[13px] font-normal leading-normal text-ink"
        >
          {MAX_PINNED_TAGS} tags are already pinned. Unpin one to make room for
          this.
        </p>
      )}
    </div>
  );
}
