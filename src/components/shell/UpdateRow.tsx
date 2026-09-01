"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CloseSmallIcon, DownloadIcon } from "@/icons";
import {
  dismissUpdate,
  getDismissedUpdate,
  getServerDismissedUpdate,
  loadUpdateCheck,
  subscribeDismissedUpdate,
} from "@/lib/deployment/update-client";
import type { UpdateCheck } from "@/lib/deployment/update";
import { UpdateDialog } from "./UpdateDialog";

type Props = {
  /** The folded strip: the glyph alone, and no way to dismiss from there. */
  compact?: boolean;
};

/**
 * The sidebar's update row. It appears only when upstream is ahead and the
 * reader hasn't waved this version away, which is to say: almost never.
 * Pressing it opens [UpdateDialog].
 */
export function UpdateRow({ compact = false }: Props) {
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [open, setOpen] = useState(false);
  const dismissed = useSyncExternalStore(
    subscribeDismissedUpdate,
    getDismissedUpdate,
    getServerDismissedUpdate,
  );

  useEffect(() => {
    let alive = true;
    void loadUpdateCheck().then((result) => {
      if (alive) setUpdate(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!update || update.state !== "behind") return null;
  // Dismissal is per version: 0.3.0 asks again, having never been answered.
  if (dismissed === update.latest) return null;

  const label = `Update to ${update.latest}`;

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          title={label}
          className="row-tint flex size-7 items-center justify-center rounded-[var(--radius-control)] text-action hover:text-action-hover"
        >
          <DownloadIcon aria-hidden className="size-3.5 shrink-0" />
        </button>
      ) : (
        <div className="row-tint-host group relative flex items-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="row-tint flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1 text-left text-[13px] text-action"
          >
            {/* The sidebar's shared left edge: every row opens with a mark in
                the dot's 7px footprint. */}
            <span
              aria-hidden
              className="flex size-[7px] shrink-0 items-center justify-center"
            >
              <DownloadIcon className="size-3.5 shrink-0" />
            </span>
            <span className="min-w-0 flex-1 truncate">Update available</span>
          </button>

          {/* Always drawn, unlike the ⋯ on a tag row: a notice you can't see
              how to silence is worse than one glyph of clutter. */}
          <button
            type="button"
            aria-label={`Dismiss the ${update.latest} update`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              dismissUpdate(update.latest);
            }}
            className="row-tint absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] text-ink-faint hover:text-ink"
          >
            <CloseSmallIcon aria-hidden className="size-3" />
          </button>
        </div>
      )}

      {open && (
        <UpdateDialog
          latest={update.latest}
          current={update.current}
          releaseUrl={update.releaseUrl}
          forkUrl={update.forkUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
