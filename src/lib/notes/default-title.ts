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
 * The title a note gets when its author never gave it one — e.g. "Thursday,
 * 13. August 2026". Month/day names are hard-coded, not from
 * toLocaleDateString, because this string is stored (as title and slug) and
 * must read the same everywhere. The calendar day still comes from the
 * runtime's timezone, so call this on the server and pass the result down.
 */
export function defaultNoteTitle(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
