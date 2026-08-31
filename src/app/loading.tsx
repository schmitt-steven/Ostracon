"use client";

import { useOffline } from "next/offline";

/**
 * A client component only so it can say *why* it is waiting.
 *
 * With experimental.useOffline on, a navigation that can't reach the server
 * doesn't fail — it parks here and retries itself when the connection comes
 * back. Which is right, but indistinguishable from a slow server unless this
 * says so.
 */
export default function Loading() {
  const isOffline = useOffline();

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-8 py-12">
      <div className="flex items-center gap-3 text-base text-ink-muted">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
        {isOffline ? "Waiting for a connection…" : "Loading…"}
      </div>
    </div>
  );
}
