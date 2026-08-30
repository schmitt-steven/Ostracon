"use client";

import { useEffect, useState } from "react";

/**
 * The login throttle's cooldown (see lib/auth/throttle), counted down live so
 * "try again in 2:00" doesn't sit there going stale. Used by the sign-in form
 * and the password dialog, which share the same throttle bucket.
 */

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * `seconds` is the server's last figure; `key` is the object it arrived in.
 * Seeded during render so the first paint shows the full duration. `key`
 * identity is what restarts the clock when a second refusal owes the same
 * number of seconds — pass a fresh object each time.
 */
export function useCountdown(seconds: number, key: unknown): number {
  const [remaining, setRemaining] = useState(seconds);
  const [seenKey, setSeenKey] = useState(key);

  if (key !== seenKey) {
    setSeenKey(key);
    setRemaining(seconds);
  }

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return remaining;
}
