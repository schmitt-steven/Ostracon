"use client";

import type { UpdateCheck } from "./update";

/**
 * The browser's half of the update check: one shared request, and the record
 * of which version the reader has waved away.
 *
 * Both are module-level rather than component state because the shell renders
 * two rails — the wide column and the touch drawer — and they have to agree.
 * Dismissing in one has to empty the other, and neither should ask GitHub a
 * question the other already asked.
 */

/* ------------------------------------------------------------------ */
/* The check                                                           */
/* ------------------------------------------------------------------ */

let inFlight: Promise<UpdateCheck | null> | null = null;

/**
 * The answer, fetched once per page load and shared by every caller. Null for
 * any failure — a rail row is not the place to report that a check didn't run.
 */
export function loadUpdateCheck(): Promise<UpdateCheck | null> {
  inFlight ??= fetch("/api/update")
    .then((response) => (response.ok ? (response.json() as Promise<UpdateCheck>) : null))
    .catch(() => null);
  return inFlight;
}

/* ------------------------------------------------------------------ */
/* The dismissal                                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "ostracon:update-dismissed";

/**
 * The version that was dismissed, not a boolean: waving away 0.2.0 says
 * nothing about 0.3.0, which should come back and ask again.
 */
let snapshot: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

export function getDismissedUpdate(): string | null {
  if (!loaded) {
    try {
      snapshot = localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      // Blocked or unavailable — nothing is dismissed, which errs toward
      // showing the row.
      snapshot = null;
    }
    loaded = true;
  }
  return snapshot;
}

/** Always null: the server cannot know, and rendering the row is the safe guess. */
export function getServerDismissedUpdate(): string | null {
  return null;
}

export function subscribeDismissedUpdate(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function dismissUpdate(version: string): void {
  snapshot = version;
  loaded = true;
  try {
    localStorage.setItem(STORAGE_KEY, version);
  } catch {
    // The in-memory snapshot still hides it for this session.
  }
  for (const onChange of listeners) onChange();
}
