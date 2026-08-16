"use client";

import { useSyncExternalStore } from "react";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

// Same curve as the mode segments so the whole toolbar strip cross-fades as
// one control rather than as two independent groups.
const TRANSITION =
  "transition-colors duration-200 ease-out motion-reduce:transition-none";

// Ternary rather than a `disabled:` variant so the greyed-out state can't
// depend on out-ordering the hover rule. Nothing left to step through fades
// the icon but keeps it in the layout — dropping it would shift the mode
// segments sideways every time the history runs out.
const button = (enabled: boolean) =>
  `flex shrink-0 items-center px-3.5 py-2.5 ${TRANSITION} ${
    enabled
      ? "text-ink-muted hover:bg-action-wash hover:text-action"
      : "text-ink-faint"
  }`;

// The platform never changes under us, so there is nothing to subscribe to.
const subscribeNever = () => () => {};
const readModKey = () =>
  navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl+";

export function HistoryControls({ canUndo, canRedo, onUndo, onRedo }: Props) {
  // The modifier differs per platform and the server can't know which one this
  // is, so it renders the bare label and the client fills the shortcut in —
  // via useSyncExternalStore rather than an effect so the two passes agree
  // instead of hydrating into a mismatch.
  const modKey = useSyncExternalStore(subscribeNever, readModKey, () => null);

  const label = (name: string, keys: string) =>
    modKey ? `${name} (${modKey}${keys})` : name;

  return (
    <div role="group" aria-label="History" className="flex items-stretch">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label={label("Undo", "Z")}
        title={label("Undo", "Z")}
        className={button(canUndo)}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label={label("Redo", "⇧Z")}
        title={label("Redo", "⇧Z")}
        className={button(canRedo)}
      >
        <RedoIcon />
      </button>
      {/* Always drawn, like the ones between the mode segments — see the note
          there on why none of them drop out any more. */}
      <div
        aria-hidden
        className={`w-px shrink-0 ${TRANSITION} bg-line`}
      />
    </div>
  );
}

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function UndoIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  );
}
