"use client";

import { useEffect, useState } from "react";
import { PinIcon } from "@/components/ui/PinIcon";
import { useTagHues } from "@/hooks/use-tag-hues";
import { MAX_PINNED_TAGS, togglePinned } from "@/lib/tags/preferences";

/**
 * Pin, at the right end of a tag index's heading row. Same shape as
 * [NotePinButton], but no local optimism — pinning a tag is a synchronous
 * localStorage write.
 */
export function TagPinButton({ tag }: { tag: string }) {
  const { preferences } = useTagHues();
  const [full, setFull] = useState(false);

  const pinned = preferences.pinned.includes(tag);
  const noRoom = !pinned && preferences.pinned.length >= MAX_PINNED_TAGS;

  // The "five already" notice auto-dismisses.
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
          // The store silently drops past the cap, so check it here.
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
          // font-* restated — this hangs off the 28px display heading.
          className="glass lift-2 absolute right-0 top-full z-40 mt-2 w-56 rounded-[var(--radius-zone)] p-3 font-sans text-[13px] font-normal leading-normal text-ink"
        >
          {MAX_PINNED_TAGS} tags are already pinned. Unpin one to make room for
          this.
        </p>
      )}
    </div>
  );
}
