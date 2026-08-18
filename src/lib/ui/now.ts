"use client";

// One clock for every relative date on the page.
//
// A list of fifty notes is fifty "14 min" labels that all go stale at the same
// moment, and giving each its own setInterval would mean fifty timers waking
// the tab up out of step with each other. This is a single minute-ticking
// store they all subscribe to — and it only runs while something is watching.

const listeners = new Set<() => void>();
let snapshot = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Zero until the first tick, which is the signal to render the *server's*
 * idea of the time rather than the reader's. Relative labels are computed from
 * the viewer's clock and timezone, which the server can't know — so the first
 * paint uses the server's and this store swaps in the real one immediately
 * after mount, in one re-render, rather than every label hydrating differently.
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
