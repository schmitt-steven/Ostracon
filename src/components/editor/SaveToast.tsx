"use client";

import { useOffline } from "next/offline";
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
 * The save chrome: a failed-save notice (the metadata line covers success), a
 * standing note while a save is waiting out a dead connection, and a one-off
 * hint for anyone who reaches for ⌘S.
 */
export function SaveToast({ status, onSave }: Props) {
  const [showHint, setShowHint] = useState(false);
  const isOffline = useOffline();

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onKeyDown(event: KeyboardEvent) {
      const save = event.key === "s" && (event.metaKey || event.ctrlKey);
      if (!save || event.altKey) return;
      // Swallow the browser's "save page" dialog and flush anyway.
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

  // No dismiss on the failure notice — it goes when a save succeeds.
  const failed = status === "error";
  /**
   * A save that can't reach the server no longer throws — experimental.
   * useOffline holds the Server Action open and re-runs it on reconnect (see
   * next.config.ts). So `error` stops appearing for this case and `saving`
   * simply persists, which without a word looks like a save that hung.
   */
  const waiting = status === "saving" && isOffline;
  if (!failed && !waiting && !showHint) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-30 flex max-w-xs flex-col items-end gap-2 text-right">
      {failed && (
        <p
          role="alert"
          className="glass lift-2 toast-enter pointer-events-auto rounded-[var(--radius-control)] px-4 py-2.5 text-[13px] text-ink"
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
      {waiting && (
        <p
          role="status"
          className="glass lift-2 toast-enter rounded-[var(--radius-control)] px-4 py-2.5 text-[13px] text-ink"
        >
          Saving when you&apos;re back online.
        </p>
      )}
      {showHint && (
        <p className="glass lift-2 toast-enter rounded-[var(--radius-control)] px-4 py-2.5 text-[13px] text-ink-muted">
          No need — this note saves itself as you type.
        </p>
      )}
    </div>
  );
}
