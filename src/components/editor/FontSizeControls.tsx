"use client";

import {
  DEFAULT_FONT_SCALE,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
} from "@/lib/editor/font-scale";

type Props = {
  /** Percentage of the editor's base text sizes. */
  scale: number;
  onStep: (direction: 1 | -1) => void;
  onReset: () => void;
};

// Same curve as the mode segments and the history buttons, so the whole
// toolbar strip cross-fades as one control — see [HistoryControls].
const TRANSITION =
  "transition-colors duration-200 ease-out motion-reduce:transition-none";

// Ternary rather than a `disabled:` variant, and the control keeps its box at
// either end of the range: same reasoning as the history buttons, since these
// sit in the same strip and shifting when they hit a limit would drag the mode
// segments with them.
const button = (enabled: boolean) =>
  `flex shrink-0 items-center justify-center px-3 py-2.5 ${TRANSITION} ${
    enabled
      ? "text-ink-muted hover:bg-action-wash hover:text-action"
      : "text-ink-faint"
  }`;

export function FontSizeControls({ scale, onStep, onReset }: Props) {
  const canShrink = scale > MIN_FONT_SCALE;
  const canGrow = scale < MAX_FONT_SCALE;
  const isDefault = scale === DEFAULT_FONT_SCALE;

  return (
    <div role="group" aria-label="Text size" className="flex items-stretch">
      <div
        aria-hidden
        className={`w-px shrink-0 ${TRANSITION} bg-line`}
      />
      <button
        type="button"
        onClick={() => onStep(-1)}
        disabled={!canShrink}
        aria-label="Smaller text"
        title="Smaller text"
        className={button(canShrink)}
      >
        <span aria-hidden className="text-xs font-semibold leading-[18px]">
          A
        </span>
      </button>
      {/* Reads as the current value and doubles as the way back to it. Always
          rendered, and tabular-nums so stepping through 90/100/110 can't
          change its width and nudge the buttons either side of it. */}
      <button
        type="button"
        onClick={onReset}
        disabled={isDefault}
        aria-label={`Text size ${scale}% — reset to ${DEFAULT_FONT_SCALE}%`}
        title={isDefault ? "Default text size" : "Reset text size"}
        className={`flex w-14 shrink-0 items-center justify-center text-xs tabular-nums ${TRANSITION} ${
          isDefault
            ? "text-ink-faint"
            : "text-ink-muted hover:bg-action-wash hover:text-action"
        }`}
      >
        {scale}%
      </button>
      <button
        type="button"
        onClick={() => onStep(1)}
        disabled={!canGrow}
        aria-label="Larger text"
        title="Larger text"
        className={button(canGrow)}
      >
        <span aria-hidden className="text-lg font-semibold leading-[18px]">
          A
        </span>
      </button>
    </div>
  );
}
