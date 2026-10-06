"use client";

import { useOffline } from "next/offline";
import { ContentBody } from "@/components/shell/ContentBody";

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

  // An empty editor: same surface, header height and column, so the real page
  // lands without a jump.
  return (
    <div className="content content-etched h-full" aria-busy>
      <ContentBody
        head={
          <header className="content-head">
            <div className="mx-auto min-h-[var(--head-h)] max-w-[680px]" />
          </header>
        }
      >
        <div className="mx-auto max-w-[680px] px-4 pb-32 min-[1000px]:px-6">
          <div className="mt-0 flex h-[36px] items-center min-[1000px]:mt-2 max-[999px]:h-[31px]">
            <div className="h-[0.9em] w-2/5 animate-pulse rounded-full bg-ink-faint/15 text-[28px] max-[999px]:text-[24px]" />
          </div>
          <div className="mt-[var(--space-hair)] flex h-5 items-center text-ui">
            {isOffline ? (
              <span className="text-ink-muted">Waiting for a connection…</span>
            ) : (
              <div className="h-2.5 w-28 animate-pulse rounded-full bg-ink-faint/10" />
            )}
          </div>
        </div>
      </ContentBody>
    </div>
  );
}
