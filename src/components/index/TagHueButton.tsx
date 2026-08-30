"use client";

import { useEffect, useRef, useState } from "react";
import { TagHuePalette } from "@/components/shell/TagHuePalette";

type Props = {
  tag: string;
  /** Current hue, override applied. */
  hue: number;
};

/**
 * The swatch in the index heading — this tag's colour, made pressable. Drawn
 * as a swatch, not a dot, so it doesn't read as a legend (see `.hue-swatch`).
 * Stands alone beside the name, which is its own rename control.
 */
export function TagHueButton({ tag, hue }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    // `pointerdown`, so dismissal lands before a click navigates.
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative flex shrink-0">
      <button
        type="button"
        aria-label={`Colour of #${tag}`}
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        // 16px, matching the pin glyph. Hit area grown by a pseudo-element,
        // not padding, which would push the heading text.
        className="hue-swatch relative size-4 rounded-full transition-transform before:absolute before:-inset-2 before:content-[''] hover:scale-125 aria-expanded:scale-125"
      />

      {open && (
        <div
          role="dialog"
          aria-label={`Colour of #${tag}`}
          // Anchored to the swatch. Fonts restated — this hangs off an h1.
          className="glass lift-2 absolute left-1/2 top-full z-20 mt-3 w-max -translate-x-1/2 rounded-[var(--radius-zone)] p-3 font-sans text-[13px] font-normal leading-normal"
        >
          <TagHuePalette tag={tag} hue={hue} />
        </div>
      )}
    </span>
  );
}
