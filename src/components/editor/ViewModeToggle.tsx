"use client";

import { Fragment } from "react";

export type ViewMode = "write" | "split" | "preview";

const MODES: { value: ViewMode; label: string }[] = [
  { value: "write", label: "Write" },
  { value: "split", label: "Split" },
  { value: "preview", label: "Preview" },
];

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

// Shared by the segments and the hairlines between them so the fill, the text
// and the dividers all cross-fade on the same curve — staggered durations read
// as three separate things happening rather than one control changing state.
// `font-medium` is unconditional on purpose: weight can't be transitioned, so
// switching it would snap the label mid-fade.
const TRANSITION =
  "transition-colors duration-200 ease-out motion-reduce:transition-none";

export function ViewModeToggle({ mode, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="View mode"
      // Full-bleed segments: no framing, no gutter. The editor box's border
      // and its overflow-hidden corners do the framing instead, so the strip
      // reads as the top edge of the editor rather than a control sitting
      // inside it.
      className="flex w-full items-stretch"
    >
      {MODES.map(({ value, label }, i) => {
        const active = mode === value;
        return (
          <Fragment key={value}>
            {i > 0 && (
              <div
                aria-hidden
                // Every hairline stays drawn, including the ones bracketing the
                // current mode: with the selection carried by the label rather
                // than by a filled block, the strip reads as three segments
                // throughout, and dropping a line beside the active one would
                // just look like a gap.
                //
                // Fixed at --line. These used to swing to --action alongside
                // the editor box's border on focus-within; that's gone, since
                // the editor holds focus the whole time you're writing and the
                // cue was lit far more often than not. The transition stays for
                // the theme swap.
                className={`w-px shrink-0 ${TRANSITION} bg-line`}
              />
            )}
            <button
              type="button"
              onClick={() => onChange(value)}
              aria-pressed={active}
              // flex-1 with no width of its own: the three modes always split
              // the editor's width evenly, whatever that width happens to be.
              //
              // The current mode is spelled in the label's colour over
              // --action-seat, a fill barely off the toolbar's own tone —
              // enough to seat the segment without turning the top of the
              // editor into a coloured bar. That's --action-wash on the cream,
              // but a segment is far larger than the pills that wash was sized
              // for, and on the dark ground it needs pulling back towards the
              // surface; the token carries that difference.
              // Hover brightens to plain ink instead, so --action means "this
              // is the mode you're in" and never merely "the pointer is here".
              className={`flex-1 py-2.5 text-sm font-medium ${TRANSITION} ${
                active
                  ? "bg-action-seat text-action"
                  : "text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {label}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
