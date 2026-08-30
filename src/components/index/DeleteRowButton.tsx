"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { TrashIcon } from "@/icons";

/**
 * Delete control for one index row — a sibling of the row's `<Link>`, not
 * nested in it. Confirming reports intent; the list owns the deletion.
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

    // `pointerdown`, so dismissal lands before a click elsewhere navigates.
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
    // Closed synchronously — the row is about to vanish under the popover.
    flushSync(() => setConfirming(false));
    onConfirm();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        // The row names no note out loud.
        aria-label={`Delete ${name}`}
        aria-expanded={confirming}
        // Hovering this previews the deletion on the row (see [data-row-delete-trigger]).
        data-row-delete-trigger
        onClick={() => setConfirming((open) => !open)}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition-all hover:bg-danger-wash hover:text-danger focus-visible:opacity-100 ${
          // Hidden until row hover, but not while confirming or focused.
          confirming
            ? "bg-danger-wash text-danger opacity-100"
            : "opacity-0 group-hover/row:opacity-100"
        }`}
      >
        <TrashIcon aria-hidden className="h-4 w-4" />
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-label={`Delete ${name}?`}
          className="glass lift-2 absolute right-0 top-full z-20 mt-2 w-56 rounded-[var(--radius-zone)] p-3"
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
