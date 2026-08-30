"use client";

import { useEffect } from "react";
import { logoutAction } from "@/lib/auth/actions";

/**
 * The "Log out?" confirmation, shared by the rail's [LogOutButton] and the
 * palette's row (via [requestLogout] / [LogOutPrompt]). Clicks don't bubble —
 * on touch the rail's onClick would unmount this.
 */
export function LogOutDialog({ onClose }: { onClose: () => void }) {
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
        {/* A form posting to the action. */}
        <form action={logoutAction} className="mt-5 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="row-tint rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-ink-muted hover:text-ink"
          >
            Stay
          </button>
          {/* Pre-selected, so Enter confirms. */}
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
