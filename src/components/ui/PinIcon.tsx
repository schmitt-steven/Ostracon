import { PinFilledIcon, PinOutlineIcon } from "@/icons";

/**
 * The pin, drawn once for the two things that can be pinned to the rail — a
 * note, from its own header, and a tag, from the head of its index.
 *
 * Same 24-unit box and same stroke as the trash it sits beside in the note
 * header, so the controls in a header read as one set. The head fills while the
 * thing is pinned: the outline alone was too quiet a difference at 16px to
 * carry a state on its own, next to a neighbour that is never filled at all.
 *
 * Two files rather than one with a `fill` prop, because an imported `.svg`
 * arrives as a finished component and there's nothing to reach into. What
 * stays here is the choice between them, which is the only part that was ever
 * this component's own.
 */
export function PinIcon({ filled }: { filled: boolean }) {
  const Glyph = filled ? PinFilledIcon : PinOutlineIcon;
  return <Glyph aria-hidden className="h-4 w-4" />;
}
