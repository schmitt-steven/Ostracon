"use client";

import { useEffect, useRef, useState } from "react";
import type { SaveStatus } from "@/hooks/use-autosave";

const SAVED_VISIBLE_MS = 2000;
// Longer than the "Saved" pill: this one is a sentence to read, not a glance.
const HINT_VISIBLE_MS = 4500;

type Props = {
  status: SaveStatus;
  /** Flushes whatever is pending — used by Retry and by ⌘S/Ctrl+S. */
  onSave: () => void;
};

export function SaveToast({ status, onSave }: Props) {
  const [showSaved, setShowSaved] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const prevStatus = useRef<SaveStatus>(status);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const wasSaving = prevStatus.current === "saving";
    prevStatus.current = status;
    // Only confirm a save that just landed — an existing note mounts already
    // in "saved", and toasting that would greet every page load.
    if (status !== "saved" || !wasSaving) return;
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), SAVED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onKeyDown(event: KeyboardEvent) {
      const save = event.key === "s" && (event.metaKey || event.ctrlKey);
      if (!save || event.altKey) return;
      // Swallow the browser's "save page" dialog and honour the intent
      // anyway — pressing it shouldn't be a no-op just because it's
      // unnecessary.
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

  // The failure toast has no dismiss: it stays until a save actually
  // succeeds, which is the point — an unsaved note shouldn't be dismissible
  // into looking fine. Conflicts are left to the inline banner, which is the
  // only place the two resolutions can be offered.
  const failed = status === "error";
  if (!failed && !showSaved && !showHint) return null;

  return (
    // top-20 clears the collapsed CornerNav disc. Opening the disc does cover
    // this, but that only happens on a deliberate hover/tap up there.
    <div className="pointer-events-none fixed right-6 top-20 z-30 flex flex-col items-end gap-2">
      {failed ? (
        <div
          role="alert"
          className="toast-enter pointer-events-auto flex items-center gap-3 rounded-full border border-accent/40 bg-accent-wash py-2.5 pl-5 pr-2.5 text-base text-ink shadow-lg shadow-shade/10"
        >
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />
          Couldn&apos;t save this note
          <button
            type="button"
            onClick={() => onSave()}
            className="rounded-full bg-accent px-4 py-1.5 text-base font-medium text-paper transition-colors hover:bg-accent-hover"
          >
            Retry
          </button>
        </div>
      ) : (
        showSaved && (
          <div
            role="status"
            className="toast-enter pointer-events-auto flex items-center gap-2.5 rounded-full border border-green/30 bg-green-wash px-5 py-2.5 text-base font-medium text-green shadow-lg shadow-shade/10"
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-green" />
            Saved
          </div>
        )
      )}
      {showHint && (
        <p className="toast-enter max-w-xs rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-ink-muted shadow-lg shadow-shade/10">
          No need — this note saves itself as you type. If a save ever fails,
          you&apos;ll be told right here.
        </p>
      )}
    </div>
  );
}
