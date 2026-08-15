"use client";

import { useSyncExternalStore } from "react";
import {
  getPendingDeletes,
  getServerPendingDeletes,
  subscribePendingDeletes,
} from "@/lib/notes/pending-deletes";

/**
 * The "N Notes" heading, counting down as rows leave.
 *
 * Takes the ids rather than a number so the count stays right at the handover:
 * a note is subtracted while its deletion is in flight, and once the
 * revalidated list arrives without it, it's simply no longer there to subtract.
 * Deriving from a plain `count - pending.length` would double-count it for the
 * frame in between.
 *
 * The number and the word are named separately for the view transition the list
 * starts (see `removeRowWithTransition`). The number gets its own animation, and
 * naming the word means it slides into place when the digits change width
 * (10 → 9) instead of jumping while the number animates beside it.
 */
export function NoteCount({ noteIds }: { noteIds: string[] }) {
  const pending = useSyncExternalStore(
    subscribePendingDeletes,
    getPendingDeletes,
    getServerPendingDeletes,
  );

  const count =
    pending.length === 0
      ? noteIds.length
      : noteIds.filter((id) => !pending.includes(id)).length;

  return (
    <>
      <span style={{ viewTransitionName: "note-count" }}>{count}</span>{" "}
      <span style={{ viewTransitionName: "note-count-label" }}>
        {count === 1 ? "Note" : "Notes"}
      </span>
    </>
  );
}
