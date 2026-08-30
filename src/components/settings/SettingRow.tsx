import type { ReactNode } from "react";

/**
 * One setting: its name, the control that changes it, and the line that
 * explains it.
 *
 * Four rows on this page are this shape — Theme, Password, Export, Import —
 * and they were four hand-rolled copies of it, which is three chances for one
 * of them to end up a couple of pixels out from its neighbours in a column
 * where the whole point is that they line up.
 *
 * **A row with a note is not the same shape as one without, so there are two.**
 * The name always starts at the top-left and the control always finishes at the
 * right-hand edge; what differs is which line the control stands on.
 *
 * Without a note there is one line and the control shares it. With a note the
 * name takes a line of its own and the control drops to stand on the note's
 * first line, for two reasons that pull the same way. The name is a 19px line
 * and the control is 32px tall, so a control on the name's line drags the note
 * a third of an inch below the words it belongs to, and the largest gap in the
 * section ends up being the one *inside* a setting. And a note beside the
 * control is a note that stops where the control begins: it wraps early instead
 * of tucking itself under a button, which is the right failure for prose in a
 * narrow pane.
 *
 * Below about 288px of note the control drops onto its own line, since past
 * that point a shrinking sentence would be reduced to two or three words a line
 * while a button sat beside it holding a third of the width.
 */
export function SettingRow({
  name,
  control,
  note,
}: {
  name: string;
  /** Pressed, chosen from, or followed — whatever changes this setting. */
  control: ReactNode;
  /** The quiet line under the name. Prose, and free to wrap. */
  note?: ReactNode;
}) {
  if (!note) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 text-[15px] leading-tight text-ink">{name}</p>
        {control}
      </div>
    );
  }

  return (
    <div>
      {/* leading-tight, because the space under this line is part of the gap
          being kept small: at the inherited 1.5 the name carries nearly four
          pixels of half-leading below its own descenders, spent on nothing. */}
      <p className="text-[15px] leading-tight text-ink">{name}</p>

      {/* No margin over this row, and the control is pulled up into it rather
          than centred in it.

          Centred was the obvious thing and it is what pushed the note down. A
          32px control next to a 19px line of prose leaves six pixels of slack,
          `align-items: center` puts half of it above the note, and those six
          pixels land in exactly the place this layout exists to keep tight —
          between a name and the sentence finishing it. So the note starts at
          the top of the row where it belongs, and the control is offset to sit
          on the *first line* of it: half a line of prose up from the top, less
          half its own height. That is also the more honest alignment for a note
          that runs to three lines, where centring on the block as a whole would
          leave the button floating against the middle of a paragraph.

          The wrapped case pays for the offset in the row gap: gap-y is 14px so
          that a control which has dropped onto its own line still clears the
          note by the 8px everything else on this page uses. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3.5">
        <div className="min-w-0 flex-1 basis-72">{note}</div>
        <div className="-mt-1.5 flex shrink-0 items-center">{control}</div>
      </div>
    </div>
  );
}
