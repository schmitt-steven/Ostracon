"use client";

import { useEffect, useState } from "react";

/**
 * The login throttle's cooldown, counted down in front of the reader.
 *
 * The server answers a refused attempt with the seconds it owes (see
 * lib/auth/throttle), which is a number that is only true at the instant it is
 * sent. Printed as-is it sits there going stale, and "try again in 2:00" that
 * still says 2:00 a minute later reads as a lock with no way out of it. Ticking
 * it is the difference between a wait and a wall.
 *
 * Two places need this — the sign-in form, and the password dialog behind it,
 * which asks for the current password and so goes through the same throttle on
 * the same bucket.
 */

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * `seconds` is what the server last said; `key` is the answer it said it in.
 *
 * Seeded during render rather than in an effect, so the first paint after a
 * refused attempt already shows the full duration instead of a frame of zero.
 *
 * The `key` is what makes a second refusal restart the clock: two failures in a
 * row can owe the same number of seconds, and a hook watching only the number
 * would see nothing change and leave the first countdown running against a
 * deadline that has since moved. Pass whatever object the server's answer
 * arrived in — its identity is new even when its contents aren't.
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
