"use client";

import { useEffect, useRef, useState } from "react";
import type { SaveStatus } from "@/hooks/use-autosave";

// Long enough to read a sentence, not a glance.
const HINT_VISIBLE_MS = 4500;

type Props = {
  status: SaveStatus;
  /** Flushes whatever is pending — used by Retry and by ⌘S/Ctrl+S. */
  onSave: () => void;
};

/**
 * What's left of the save chrome.
 *
 * The "Saved" confirmation is gone: the metadata line under the title already
 * reads "Edited just now" the moment a save lands, which says the same thing
 * in the place the reader is already looking, and a green pill flying in every
 * few seconds while typing was the loudest thing in the editor.
 *
 * What remains is the case that genuinely needs interrupting — a save that
 * failed — plus a one-off answer for anyone who reaches for ⌘S out of habit.
 */
export function SaveToast({ status, onSave }: Props) {
  const [showHint, setShowHint] = useState(false);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onKeyDown(event: KeyboardEvent) {
      const save = event.key === "s" && (event.metaKey || event.ctrlKey);
      if (!save || event.altKey) return;
      // Swallow the browser's "save page" dialog and honour the intent anyway
      // — pressing it shouldn't be a no-op just because it's unnecessary.
      event.preventDefault();
      onSaveRef.current();
      setShowHint(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShowHint(false), HINT_VISIBLE_MS);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(timer);
    };
  }, []);

  // No dismiss on the failure notice, deliberately: an unsaved note shouldn't
  // be dismissible into looking fine. It goes when a save actually succeeds.
  const failed = status === "error";
  if (!failed && !showHint) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-30 flex max-w-xs flex-col items-end gap-2 text-right">
      {failed && (
        <p
          role="alert"
          className="toast-enter pointer-events-auto rounded-[var(--radius-control)] bg-surface px-4 py-2.5 text-[13px] text-ink shadow-lg shadow-shade/15"
        >
          Couldn&apos;t save this note.{" "}
          <button
            type="button"
            onClick={() => onSave()}
            className="text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Retry
          </button>
        </p>
      )}
      {showHint && (
        <p className="toast-enter rounded-[var(--radius-control)] bg-surface px-4 py-2.5 text-[13px] text-ink-muted shadow-lg shadow-shade/15">
          No need — this note saves itself as you type.
        </p>
      )}
    </div>
  );
}
