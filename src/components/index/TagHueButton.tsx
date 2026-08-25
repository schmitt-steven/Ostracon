"use client";

import { useEffect, useRef, useState } from "react";
import { TagHuePalette } from "@/components/shell/TagHuePalette";

type Props = {
  tag: string;
  /** Current hue, override applied. */
  hue: number;
};

/**
 * The swatch in the index heading — this tag's colour, made pressable.
 *
 * Colour used to live only in the rail's right-click menu, which is a fine
 * place for it and an undiscoverable one — you have to already suspect it's
 * there. The swatch at the top of a tag's own page is the largest, most obvious
 * piece of that tag's colour anywhere in the interface, so it's the thing a
 * reader reaches for first when two tags collided on the same slot. Now it
 * answers.
 *
 * It is drawn as a swatch rather than as a dot for exactly that reason: at 9px
 * it matched every other hue dot in the app, all of which are legends, and read
 * as one — a label saying what colour this is, not a control for changing it.
 * See `.hue-swatch`. It stands on its own beside the name rather than sharing a
 * pill with it, because the name is now its own control (rename) and one pill
 * around two different verbs made both of them vague.
 */
export function TagHueButton({ tag, hue }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    // `pointerdown` rather than `click`, matching the row delete popover: the
    // dismissal has to land before whatever was clicked navigates away.
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
        // 16px — the size of the pin's glyph at the other end of the row, so
        // the two ends of the heading are weighted the same. The rim is what
        // makes it a control at this size, not the diameter.
        //
        // The hit area is grown by a pseudo-element rather than by padding:
        // padding would push the heading text right of the swatch's own edge
        // and break the left margin the title block shares with the list below.
        className="hue-swatch relative size-4 rounded-full transition-transform before:absolute before:-inset-2 before:content-[''] hover:scale-125 aria-expanded:scale-125"
      />

      {open && (
        <div
          role="dialog"
          aria-label={`Colour of #${tag}`}
          // Anchored to the swatch, not to the heading row: the palette's
          // sixteen line up under the colour they replace. Fonts are restated
          // because this hangs
          // off an h1 — display face at 28px otherwise inherits straight into
          // the label.
          className="glass lift-2 absolute left-1/2 top-full z-20 mt-3 w-max -translate-x-1/2 rounded-[var(--radius-zone)] p-3 font-sans text-[13px] font-normal leading-normal"
        >
          <TagHuePalette tag={tag} hue={hue} />
        </div>
      )}
    </span>
  );
}
