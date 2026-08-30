"use client";

import { useState } from "react";
import { LogOutIcon } from "@/icons";
import { LogOutDialog } from "./LogOutDialog";

type Props = {
  /** The folded rail's icon strip: glyph only, labelled by title/aria. */
  compact?: boolean;
};

/**
 * Log out, with a confirmation in front of it.
 *
 * The button sits at the foot of the rail directly under Settings — where the
 * theme toggle used to be, and the reason for the same worry: two rows apart,
 * both one click, one of them ending the session. The confirmation itself is
 * [LogOutDialog], shared with the command palette's "Log out" row.
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
          <LogOutIcon aria-hidden className="size-3.5 shrink-0" />
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
          {/* The same 7px mark slot every [RailRow] opens with, so this name
              starts on the rail's one left edge rather than a glyph-width in
              from it. The icon overhangs it into the row's own padding. */}
          <span
            aria-hidden
            className="flex size-[7px] shrink-0 items-center justify-center"
          >
            <LogOutIcon className="size-3.5 shrink-0" />
          </span>
          Log out
        </button>
      )}

      {confirming && <LogOutDialog onClose={() => setConfirming(false)} />}
    </>
  );
}
