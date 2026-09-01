"use client";

import { useOffline } from "next/offline";

/**
 * Says so when the network has gone, and why nothing is arriving.
 *
 * `useOffline` is more trustworthy than `navigator.onLine`, which only reports
 * whether an interface is up — it also flips when a navigation or a Server
 * Action actually fails to reach the origin. Needs experimental.useOffline in
 * next.config.ts; without it the hook is always false.
 *
 * Bottom *left*, unlike the save and import toasts. Those report something
 * that just happened and take the top-right corner in turn; this reports a
 * condition that stands until it doesn't, and has to be able to sit there
 * while one of them is showing.
 */
export function OfflineToast() {
  const isOffline = useOffline();
  if (!isOffline) return null;

  return (
    <div
      // Lifted clear of the touch bottom bar below 1000px, where bottom-6
      // would land on top of it.
      className="pointer-events-none fixed bottom-24 left-6 z-40 max-w-xs min-[1000px]:bottom-6"
    >
      <p
        role="status"
        className="glass lift-2 toast-enter rounded-[var(--radius-control)] px-4 py-2.5 text-[13px] text-ink"
      >
        Offline.{" "}
        <span className="text-ink-muted">
          Edits are kept and saved when you&apos;re back.
        </span>
      </p>
    </div>
  );
}
