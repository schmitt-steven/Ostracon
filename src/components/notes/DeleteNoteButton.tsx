"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4.5 w-4.5"
    >
      <path d="M4 7h16" />
      <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11.5v5.5M14 11.5v5.5" />
    </svg>
  );
}

/**
 * Delete control for one row of the note list.
 *
 * Sits beside the card's `<Link>` rather than inside it — a button nested in an
 * anchor is invalid, and keeping them siblings is also what stops a click here
 * from navigating into the note being deleted.
 *
 * Confirming only reports the intent; the list owns the deletion itself, since
 * it's the list that has to animate the row out.
 */
export function DeleteNoteButton({
  title,
  onConfirm,
}: {
  title: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const name = title || "Untitled";

  useEffect(() => {
    if (!confirming) return;

    // A click anywhere else dismisses — including on another row's card, which
    // would otherwise navigate away with this popover still open. `pointerdown`
    // rather than `click` so the dismissal lands before that navigation.
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setConfirming(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirming(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [confirming]);

  function confirm() {
    // Closed synchronously, before handing over: the row is about to be
    // snapshotted for its exit animation, and an open popover would be caught
    // in that snapshot and fade out hanging over the card below.
    flushSync(() => setConfirming(false));
    onConfirm();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        // The row gives no other spoken clue which note this belongs to.
        aria-label={`Delete ${name}`}
        aria-expanded={confirming}
        onClick={() => setConfirming((open) => !open)}
        className={`flex h-9 w-9 items-center justify-center rounded-full text-ink-faint transition-all hover:bg-danger-wash hover:text-danger focus-visible:opacity-100 ${
          // Hidden until the row is hovered, but never hidden while it's asking
          // for confirmation — or while a keyboard user is tabbing through it.
          confirming
            ? "bg-danger-wash text-danger opacity-100"
            : "opacity-0 group-hover/note:opacity-100"
        }`}
      >
        <TrashIcon />
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-label={`Delete ${name}?`}
          className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-line bg-surface p-4 shadow-lg shadow-ink/10"
        >
          <p className="text-sm text-ink">
            Delete <span className="font-medium">{name}</span>?
          </p>
          <p className="mt-1 text-sm text-ink-faint">
            Its images are deleted too.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              No
            </button>
            <button
              type="button"
              // Pre-selected, so Enter confirms straight away.
              autoFocus
              onClick={confirm}
              className="rounded-full bg-danger px-3.5 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-danger-hover"
            >
              Yes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
