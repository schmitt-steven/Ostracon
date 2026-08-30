"use client";

import { useEffect } from "react";
import { logoutAction } from "@/lib/auth/actions";

/**
 * The "Log out?" confirmation.
 *
 * Shared by the rail's [LogOutButton] and the command palette's "Log out" row
 * (which reaches it through [requestLogout] and [LogOutPrompt]): both are one
 * aimed click or one typed word away from ending the session, which is the
 * worry that put a confirmation here to begin with. A mis-aimed click used to
 * drop you at the login screen with whatever you were doing gone from view.
 *
 * Clicks are stopped from bubbling: on touch the whole rail sits inside an
 * onClick that closes the drawer, and closing the drawer unmounts the rail —
 * so the copy the rail hosts would go with it before you could answer.
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
