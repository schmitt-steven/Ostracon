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
 * A relative timestamp in the reader's own clock and timezone.
 *
 * The server renders it against its own clock, which can disagree — a note
 * edited late in the evening is "Yesterday" in one timezone and "12 Aug" in
 * another. `suppressHydrationWarning` covers exactly that frame; the shared
 * clock (see lib/ui/now) then re-renders every label on the page at once with
 * the reader's time, and keeps them ticking after that so "14 min" doesn't sit
 * there being wrong while a note is open.
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
      {long ? longRelative(parsed, reference) : shortRelative(parsed, reference)}
    </time>
  );
}
