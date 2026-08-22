"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/lib/auth/actions";

type Props = {
  /** The folded rail's icon strip: glyph only, labelled by title/aria. */
  compact?: boolean;
};

/**
 * Log out, with a confirmation in front of it.
 *
 * The button sits at the foot of the rail directly under the theme toggle —
 * two rows apart, both one click, one of them ending the session. The
 * confirmation is there because a mis-aimed click used to drop you at the
 * login screen with whatever you were doing gone from the screen.
 *
 * Clicks are stopped from bubbling: on touch the whole rail is inside an
 * onClick that closes the drawer, and closing the drawer unmounts the rail —
 * and the dialog with it — before you can answer.
 */
export function LogOutButton({ compact = false }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {compact ? (
        <button
          type="button"
          aria-label="Log out"
          title="Log out"
          aria-haspopup="dialog"
          aria-expanded={confirming}
          onClick={(event) => {
            event.stopPropagation();
            setConfirming(true);
          }}
          className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:text-ink"
        >
          <LogOutIcon />
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={confirming}
          onClick={(event) => {
            event.stopPropagation();
            setConfirming(true);
          }}
          className="row-tint flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1 text-left text-[13px] text-ink-muted hover:text-ink"
        >
          <LogOutIcon />
          Log out
        </button>
      )}

      {confirming && <LogOutDialog onClose={() => setConfirming(false)} />}
    </>
  );
}

function LogOutDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Captured, so the view underneath doesn't also act on the same press.
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Log out"
      className="scrim fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="glass lift-3 w-full max-w-md rounded-[var(--radius-zone)] p-6">
        <p className="text-base text-ink">Log out?</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          You&apos;ll need to sign in again to get back to your notes.
        </p>
        {/* Still a form posting to the action, so logging out works the same
            way it did before this dialog was put in front of it. */}
        <form action={logoutAction} className="mt-5 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="row-tint rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-ink-muted hover:text-ink"
          >
            Stay
          </button>
          {/* Pre-selected, so Enter confirms straight away — the same order
              and wording as the note delete confirmation. */}
          <button
            type="submit"
            autoFocus
            className="row-tint rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-danger hover:text-danger-hover"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}

function LogOutIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.2 2.2H3.4a1.2 1.2 0 0 0-1.2 1.2v9.2a1.2 1.2 0 0 0 1.2 1.2h2.8" />
      <path d="M10.4 11.2 13.6 8l-3.2-3.2M13.6 8H6.2" />
    </svg>
  );
}
