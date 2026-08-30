"use client";

import { useSyncExternalStore } from "react";
import { longRelative, shortRelative } from "@/lib/notes/relative-time";
import { getNow, getServerNow, subscribeNow } from "@/lib/ui/now";

type Props = {
  /** ISO-8601. */
  date: string;
  /** `14 minutes ago` instead of `14 min`. */
  long?: boolean;
  className?: string;
};

/**
 * A relative timestamp in the reader's clock and timezone.
 * `suppressHydrationWarning` covers the server/client disagreement; the shared
 * clock (lib/ui/now) then re-renders every label with the reader's time and
 * keeps them ticking.
 */
export function RelativeDate({ date, long = false, className }: Props) {
  const now = useSyncExternalStore(subscribeNow, getNow, getServerNow);
  const parsed = new Date(date);
  const reference = now === 0 ? new Date() : new Date(now);

  return (
    <time
      dateTime={date}
      title={parsed.toLocaleString()}
      suppressHydrationWarning
      className={className}
    >
      {long
        ? longRelative(parsed, reference)
        : shortRelative(parsed, reference)}
    </time>
  );
}
