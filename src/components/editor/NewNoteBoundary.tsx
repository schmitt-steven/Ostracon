"use client";

import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";

const NEW_NOTE_PATH = "/notes/new";

/**
 * Gives /notes/new a fresh editor each time it is navigated to.
 *
 * A new note's editor swaps its own URL once the note exists
 * (history.replaceState, see NoteEditor's onCreated), so the router still has
 * the /notes/new segment mounted under the note's address. Following "New
 * note" from there lands on the same segment, and React would keep that
 * editor — still holding the note just written, now under /notes/new. The
 * path changing back to /notes/new is what marks the second visit, so that is
 * when the key moves on. A refresh keeps the path and the editor alike, so a
 * draft being typed is never thrown away.
 */
export function NewNoteBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  const [visit, setVisit] = useState(0);

  // Adjusting state while rendering, React's pattern for "reset when a value
  // changes" — no effect, so the old editor never paints under the new URL.
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    if (pathname === NEW_NOTE_PATH) setVisit((n) => n + 1);
  }

  return <Fragment key={visit}>{children}</Fragment>;
}
