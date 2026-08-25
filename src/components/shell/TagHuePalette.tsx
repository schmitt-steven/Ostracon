"use client";

import { HUE_SLOTS, tagRoot } from "@/lib/tags/hue";
import { setTagHue } from "@/lib/tags/preferences";

type Props = {
  tag: string;
  /** Current hue, override applied — what the swatch row shows as chosen. */
  hue: number;
};

/**
 * The sixteen slots. Shared by the rail's context menu and the index heading's
 * dot so that "change this tag's colour" is one control that happens to be
 * reachable from two places, not two controls that have to be kept saying the
 * same thing.
 *
 * Sixteen swatches, not a picker. The palette *is* sixteen slots wide (see
 * lib/tags/hue) and an override is a move between them — a free-colour input
 * would let one tag out of the system that keeps all of them legible, and the
 * locked lightness is the only reason a hue can be trusted to stay readable in
 * both themes.
 *
 * Picking doesn't dismiss whatever opened this. Landing on the right slot
 * usually takes two or three tries, and a menu that closed on the first one
 * would make comparing them a matter of reopening it each time.
 */
export function TagHuePalette({ tag, hue }: Props) {
  // Overrides are keyed on the root (see use-tag-hues), so recolouring
  // `#infra/ci` recolours `#infra` and every other child with it. That's the
  // inheritance working as intended, but it's a surprise if the row you
  // clicked was the child — so the heading names what actually changes.
  const root = tagRoot(tag);

  return (
    <>
      <p className="pb-1.5 text-[13px] text-ink-faint">
        {root === tag ? "Colour" : `Colour of #${root}`}
      </p>
      {/* Two rows of eight, fixed — not flex-wrap. The row count is a property
          of the palette, not of whatever it was opened inside: the rail's menu
          is 208px and would wrap it 8/8 on its own, while the index heading's
          popover is `w-max` and would lay all sixteen out in one 346px line. A
          grid makes both mounts the same block of colour. */}
      <div className="grid w-max grid-cols-8 gap-1.5">
        {HUE_SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            aria-label={`Hue ${slot} degrees`}
            aria-pressed={hue === slot}
            onClick={() => setTagHue(tag, slot)}
            style={{ "--h": slot } as React.CSSProperties}
            // The two rims are in `.hue-slot`, keyed off :hover and the
            // aria-pressed already declared above — so "which one is chosen" is
            // said once, in the attribute a screen reader reads, rather than
            // once there and again in a class name that could disagree with it.
            //
            // The scale stays as a second cue on the chosen one, not as the
            // only one. It was the only one, and "bigger" is a thing you read by
            // comparison with its neighbours: fine for spotting which of sixteen,
            // useless for confirming the one you just pressed took.
            className={`hue-dot hue-slot size-4 rounded-full transition-transform ${
              hue === slot ? "scale-125" : "opacity-70 hover:opacity-100"
            }`}
          />
        ))}
      </div>
    </>
  );
}
