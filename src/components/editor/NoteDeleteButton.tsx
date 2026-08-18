"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteNote } from "@/lib/notes/actions";

/**
 * Delete, in the header of the note you're reading.
 *
 * It used to live one press deeper, behind a `⋯` — but a menu holding a
 * single item is a menu that only ever asks you to open it. The trash sits
 * out in the open instead; the confirmation step it already had is what
 * keeps the press from being dangerous.
 *
 * The index rows have their own hover control for deleting from the list
 * without opening anything.
 */
export function NoteDeleteButton({
  noteId,
  title,
}: {
  noteId: string;
  title: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const name = title || "Untitled";

  useEffect(() => {
    if (!confirming) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setConfirming(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Stops the note view's own Escape handler from navigating away at the
      // same time as this closes.
      event.stopPropagation();
      setConfirming(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [confirming]);

  function confirmDelete() {
    startTransition(async () => {
      await deleteNote(noteId);
      router.push("/");
    });
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        // The header gives no other spoken clue which note this belongs to.
        aria-label={`Delete ${name}`}
        aria-expanded={confirming}
        onClick={() => setConfirming((open) => !open)}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-danger-wash hover:text-danger ${
          confirming ? "bg-danger-wash text-danger" : "text-ink-faint"
        }`}
      >
        <TrashIcon />
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-label={`Delete ${name}?`}
          className="absolute right-0 top-full z-40 mt-2 w-56 rounded-[var(--radius-zone)] border border-line bg-surface p-3 shadow-lg shadow-shade/20"
        >
          <p className="text-[13px] text-ink">
            Delete <span className="font-medium">{name}</span>? This
            can&apos;t be undone.
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
              onClick={confirmDelete}
              disabled={pending}
              className="row-tint rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-danger hover:text-danger-hover"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Drawn here rather than imported, the way the index row's own delete control
   keeps its copy: same 24-unit box, same stroke, so the two read as one. */
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
