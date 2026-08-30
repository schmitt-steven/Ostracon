"use client";

// One minute-ticking clock every relative date on the page subscribes to,
// instead of a setInterval per label. Runs only while something is watching.

const listeners = new Set<() => void>();
let snapshot = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Zero until the first tick — the signal to use the server's time, not the
 * reader's. Keeps the first paint stable across hydration; the real clock
 * swaps in one re-render after mount.
 */
export function getNow(): number {
  return snapshot;
}

/** Always 0 — see above. */
export function getServerNow(): number {
  return 0;
}

export function subscribeNow(onChange: () => void): () => void {
  listeners.add(onChange);
  if (timer === null) {
    timer = setInterval(() => {
      snapshot = Date.now();
      for (const listener of listeners) listener();
    }, 60_000);
    // The store reads 0 during the hydrating render; this schedules the swap
    // to the reader's real clock for immediately after it.
    queueMicrotask(() => {
      snapshot = Date.now();
      for (const listener of listeners) listener();
    });
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}
