"use client";

import { useEffect, useRef, useState } from "react";
import { HUE_SLOTS, tagHue } from "@/lib/tags/hue";
import {
  MAX_PINNED,
  movePinned,
  setTagHue,
  togglePinned,
} from "@/lib/tags/preferences";

type Props = {
  tag: string;
  pinned: boolean;
  pinnedCount: number;
  /** Current hue, override applied — what the swatch row shows as chosen. */
  hue: number;
  overridden: boolean;
  onRename: () => void;
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
  overridden,
  onRename,
  onClose,
  x,
  y,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  // Flipped back inside the viewport once its real size is known — opening
  // near the bottom of a long rail otherwise puts half the menu off-screen.
  useEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPlacement({
      left: Math.min(x, window.innerWidth - box.width - 8),
      top: Math.min(y, window.innerHeight - box.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const item =
    "row-tint w-full rounded-[var(--radius-control)] px-3 py-1.5 text-left text-[13px] text-ink-muted hover:text-ink";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`#${tag}`}
      style={{ left: placement.left, top: placement.top }}
      className="fixed z-50 w-52 rounded-[var(--radius-zone)] bg-surface p-1.5 shadow-lg shadow-shade/20"
    >
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          togglePinned(tag);
          onClose();
        }}
        // The list is capped, so the control says why it's unavailable rather
        // than silently doing nothing on click.
        disabled={!pinned && pinnedCount >= MAX_PINNED}
      >
        {pinned
          ? "Unpin"
          : pinnedCount >= MAX_PINNED
            ? `Pinned list is full (${MAX_PINNED})`
            : "Pin to top"}
      </button>

      {pinned && (
        <>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => movePinned(tag, -1)}
          >
            Move up
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => movePinned(tag, 1)}
          >
            Move down
          </button>
        </>
      )}

      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        Rename everywhere…
      </button>

      {/* Twelve swatches, not a picker. The palette is twelve slots wide and
          an override is a move between them — a free-colour input would let a
          tag out of the system that keeps all of them consistent. */}
      <div className="px-3 pb-1.5 pt-2.5">
        <p className="pb-1.5 text-[13px] text-ink-faint">Colour</p>
        <div className="flex flex-wrap gap-1.5">
          {HUE_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              aria-label={`Hue ${slot} degrees`}
              aria-pressed={hue === slot}
              onClick={() => setTagHue(tag, slot)}
              style={{ "--h": slot } as React.CSSProperties}
              className={`hue-dot size-4 rounded-full transition-transform ${
                hue === slot ? "scale-125" : "opacity-70 hover:opacity-100"
              }`}
            />
          ))}
        </div>
        {overridden && (
          <button
            type="button"
            onClick={() => setTagHue(tag, null)}
            className="mt-2 text-[13px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Back to derived ({tagHue(tag)}°)
          </button>
        )}
      </div>
    </div>
  );
}
