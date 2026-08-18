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
      className="h-4 w-4"
    >
      <path d="M4 7h16" />
      <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11.5v5.5M14 11.5v5.5" />
    </svg>
  );
}

/**
 * Delete control for one row of the index — a sibling of the row's `<Link>`,
 * not nested in it, so this can sit right in the corner the relative date
 * vacates on hover without an anchor ending up inside an anchor.
 *
 * Confirming only reports the intent; the list owns the actual deletion,
 * since it's the list that has to drop the row from what it's showing.
 */
export function DeleteRowButton({
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

    // A click anywhere else dismisses — including on another row's link,
    // which would otherwise navigate away with this popover still open.
    // `pointerdown` rather than `click` so the dismissal lands before that
    // navigation.
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
    // Closed synchronously: the row is about to disappear from the list, and
    // an open popover would otherwise be left hanging over whatever slides
    // up to take its place.
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
        // A hook for the row itself: hovering this previews the deletion —
        // row tinted red, title struck through — the same way a tag pill
        // previews its own removal.
        data-row-delete-trigger
        onClick={() => setConfirming((open) => !open)}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition-all hover:bg-danger-wash hover:text-danger focus-visible:opacity-100 ${
          // Hidden until the row is hovered, but never hidden while it's
          // asking for confirmation — or while a keyboard user is tabbing
          // through it.
          confirming
            ? "bg-danger-wash text-danger opacity-100"
            : "opacity-0 group-hover/row:opacity-100"
        }`}
      >
        <TrashIcon />
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-label={`Delete ${name}?`}
          className="absolute right-0 top-full z-20 mt-2 w-56 rounded-[var(--radius-zone)] border border-line bg-surface p-3 shadow-lg shadow-shade/20"
        >
          <p className="text-[13px] text-ink">
            Delete <span className="font-medium">{name}</span>?
          </p>
          <div className="mt-2.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="row-tint rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-ink-muted hover:text-ink"
            >
              Keep
            </button>
            <button
              type="button"
              // Pre-selected, so Enter confirms straight away.
              autoFocus
              onClick={confirm}
              className="row-tint rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-danger hover:text-danger-hover"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
