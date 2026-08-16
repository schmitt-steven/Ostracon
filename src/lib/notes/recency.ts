/**
 * The tags nobody types: a note's own "created today" / "modified today".
 * `null` is the ordinary case — a note nothing happened to today.
 *
 * A note carries at most one of the two. One created today has almost
 * certainly also been modified today (the editor saves as you type), so
 * carrying both would put "modified today" on every new note and say nothing;
 * the day it came into existence is the more interesting of the two facts.
 */
export type NoteRecency = "created" | "modified";

/** In the order they're offered as filters. */
export const RECENCY_MODES: readonly NoteRecency[] = ["created", "modified"];

/** One source for both labels: the tag on the note, and the filter pill. */
export const RECENCY_LABEL: Record<NoteRecency, string> = {
  created: "created today",
  modified: "modified today",
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Call this on the server and pass the result down. "Today" is a calendar day
 * in the runtime's timezone, so a browser in another zone could disagree with
 * the server that rendered the page — and unlike a differing timestamp, that
 * mismatch is a whole tag appearing or disappearing under hydration. Same
 * reason [defaultNoteTitle] is minted server-side.
 */
export function noteRecency(
  createdAt: Date,
  updatedAt: Date,
  now: Date = new Date(),
): NoteRecency | null {
  if (isSameDay(createdAt, now)) return "created";
  if (isSameDay(updatedAt, now)) return "modified";
  return null;
}
