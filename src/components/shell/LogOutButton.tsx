"use client";

import { useState } from "react";
import { LogOutIcon } from "@/icons";
import { LogOutDialog } from "./LogOutDialog";

type Props = {
  /** The folded rail's icon strip: glyph only, labelled by title/aria. */
  compact?: boolean;
};

/**
 * Log out, behind a confirmation ([LogOutDialog], shared with the palette's
 * row). Clicks don't bubble — on touch, the rail's onClick closes the drawer
 * and would unmount the dialog.
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
          {/* The 7px mark slot [RailRow] uses, so the name lines up. */}
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
