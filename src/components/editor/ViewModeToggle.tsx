"use client";

import { Segmented } from "@/components/ui/Segmented";
import { EyeIcon, PencilIcon } from "@/icons";

export type ViewMode = "write" | "split" | "preview";

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "write", label: "Write" },
  { value: "preview", label: "Preview" },
  { value: "split", label: "Split" },
];

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

/**
 * The mode switch: one control, in two shapes.
 *
 * Wide, it is a [Segmented] track — the same object the theme setting is, and
 * for the same reason: three fixed choices all worth showing at once, with a
 * marker that slides between them rather than three loose buttons lighting up
 * independently. Everything about how it is drawn lives there; what is set
 * here is only what this one place needs of it — the height of the buttons
 * beside it in the header, and that it isn't offered at all below 1000px.
 *
 * Below the shell's 1000px it is a single button that swaps between writing
 * and reading. Split is gone there — two columns inside a phone's width are
 * two columns too narrow to read either of them, so the mode isn't offered
 * (NoteEditor drops it from the palette too, and folds it back to Write if
 * the window is dragged down past the breakpoint). With one choice left,
 * three segments' worth of header would be spent saying what one word says:
 * the button is labelled with the side you aren't on, and pressing it goes
 * there.
 *
 * Nothing here is coloured: colour in this design means "this is a tag", and
 * spending it on a view toggle would dilute the one thing hue is for.
 */
export function ViewModeToggle({ mode, onChange }: Props) {
  // Split collapses to the writing surface on a narrow screen, so the compact
  // button treats it as Write — true for the frame between a resize and the
  // fold-back, and the honest reading of it in any case.
  const previewing = mode === "preview";

  return (
    <>
      <Segmented
        label="View mode"
        value={mode}
        options={VIEW_MODES}
        onChange={onChange}
        // h-7 is the pin and delete buttons' height — the three controls end
        // this row, and a track standing taller than the pair beside it was
        // the one thing in the header not sitting on the same line.
        className="hidden h-7 min-[1000px]:grid"
        // A floor under the segments, so the track keeps its width as the
        // marker moves rather than breathing with the labels.
        segmentClassName="min-w-[68px]"
      />

      {/* Touch only. No aria-label over the top of the text: the word in the
          button is the name of the button, and a spoken label that disagreed
          with it would break saying it out loud to click it. */}
      <button
        type="button"
        onClick={() => onChange(previewing ? "write" : "preview")}
        className="row-tint flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-[13px] text-ink-muted min-[1000px]:hidden"
      >
        {previewing ? <PencilIcon aria-hidden className="size-3.5 shrink-0" /> : <EyeIcon aria-hidden className="size-3.5 shrink-0" />}
        {previewing ? "Write" : "Preview"}
      </button>
    </>
  );
}
