/**
 * Relative dates, in the two lengths the design asks for: a short form for the
 * right edge of an index row, and a sentence form for the note's metadata line.
 *
 * Pure, and takes `now` explicitly, so the caller decides whose clock is being
 * read — see [RelativeDate], where that's the reader's rather than the
 * server's.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Whole days between two instants, counted by calendar day rather than by 24h. */
function daysApart(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / (24 * HOUR));
}

/**
 * The index row's date: `14 min`, `Yesterday`, `12 Aug`.
 *
 * Short because the row's other half is a serif title and a snippet, and a
 * full timestamp there would compete with them for the eye. `nowrap` at the
 * call site keeps it on one line whatever the column width does.
 */
export function shortRelative(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min`;

  const days = daysApart(date, now);
  if (days === 0) return `${Math.floor(elapsed / HOUR)} h`;
  if (days === 1) return "Yesterday";

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** The note's metadata line: `14 minutes ago`, `yesterday`, `on 12 August`. */
export function longRelative(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const days = daysApart(date, now);
  if (days === 0) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return `on ${date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}
