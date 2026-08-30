import { PinFilledIcon, PinOutlineIcon } from "@/icons";

/**
 * The pin, for the two pinnable things (a note, a tag). Same box and stroke as
 * the trash beside it. Fills while pinned. Two files, since an imported `.svg`
 * has no `fill` prop to reach into.
 */
export function PinIcon({ filled }: { filled: boolean }) {
  const Glyph = filled ? PinFilledIcon : PinOutlineIcon;
  return <Glyph aria-hidden className="h-4 w-4" />;
}
