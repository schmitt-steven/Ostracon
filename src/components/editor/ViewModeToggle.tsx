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
        // The hairline is always in the layout (so selecting a mode never
        // nudges the segments sideways) but goes transparent where it would
        // meet the filled segment — a line drawn onto the blue edge reads as
        // an artifact rather than a divider.
        const touchesActive = active || mode === MODES[i - 1]?.value;
        return (
          <Fragment key={value}>
            {i > 0 && (
              <div
                aria-hidden
                // Same cream-to-blue swing as the editor box's border (the
                // `group` is that box) so every line in the frame moves
                // together when the editor takes focus.
                className={`w-px shrink-0 ${TRANSITION} ${touchesActive ? "bg-transparent" : "bg-line group-focus-within:bg-blue/50"}`}
              />
            )}
            <button
              type="button"
              onClick={() => onChange(value)}
              aria-pressed={active}
              // flex-1 with no width of its own: the three modes always split
              // the editor's width evenly, whatever that width happens to be.
              className={`flex-1 py-2.5 text-sm font-medium ${TRANSITION} ${
                active
                  ? "bg-blue text-paper"
                  : "text-ink-muted hover:bg-blue-wash hover:text-blue"
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
