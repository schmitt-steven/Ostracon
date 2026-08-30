"use client";

import { HUE_SLOTS, tagRoot } from "@/lib/tags/hue";
import { setTagHue } from "@/lib/tags/preferences";

type Props = {
  tag: string;
  /** Current hue, override applied — what the swatch row shows as chosen. */
  hue: number;
};

/**
 * The sixteen hue slots, shared by the rail's menu and the index heading's
 * dot. Sixteen swatches, not a free-colour picker — an override is a move
 * between slots (see lib/tags/hue), and locked lightness is what keeps hues
 * readable in both themes. Picking doesn't dismiss the opener.
 */
export function TagHuePalette({ tag, hue }: Props) {
  // Overrides are keyed on the root (see use-tag-hues) — so the heading names
  // the root when you clicked a child.
  const root = tagRoot(tag);

  return (
    <>
      <p className="pb-1.5 text-[13px] text-ink-faint">
        {root === tag ? "Colour" : `Colour of #${root}`}
      </p>
      {/* A fixed 8-column grid, not flex-wrap — the same block of colour in
          both mounts (the 208px menu and the `w-max` popover). */}
      <div className="grid w-max grid-cols-8 gap-1.5">
        {HUE_SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            aria-label={`Hue ${slot} degrees`}
            aria-pressed={hue === slot}
            onClick={() => setTagHue(tag, slot)}
            style={{ "--h": slot } as React.CSSProperties}
            // `.hue-slot` keys its rims off :hover and aria-pressed; the scale
            // is a second cue on the chosen one.
            className={`hue-dot hue-slot size-4 rounded-full transition-transform ${
              hue === slot ? "scale-125" : "opacity-70 hover:opacity-100"
            }`}
          />
        ))}
      </div>
    </>
  );
}
