const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The title a note carries when its author never gave it one — the day it was
 * written, e.g. "Thursday, 13. August 2026".
 *
 * The names are spelled out here rather than left to toLocaleDateString: this
 * string is *stored* (it becomes the note's title and its slug), so it has to
 * read the same whoever renders it, and Node's default locale on the host is
 * nobody's deliberate choice. `LocalDate` is the opposite case — a timestamp
 * shown to a reader, where their own locale is exactly what's wanted.
 *
 * The calendar day still comes from the runtime's timezone, so call this on
 * the server (where the stored title is minted) and pass the result down,
 * rather than recomputing it in the browser.
 */
export function defaultNoteTitle(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
