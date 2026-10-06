import { defaultNoteTitle } from "./default-title";

export const DAILY_TAG = "journal"
/** A calendar day as `YYYY-MM-DD`, no time, no timezone. */
export type DayKey = string & { readonly __brand: "DayKey" };

/** The browser's local calendar day as `YYYY-MM-DD`. */
export function todayKey(): DayKey {
    const now = new Date();
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}` as DayKey
}

export function dailyNoteTitle(day: DayKey): string {
    const [year, month, date] = day.split("-").map(Number) as [number, number, number];

    // Noon, so a DST jump at midnight can't move it to another day.
    return defaultNoteTitle(new Date(year, month - 1, date, 12));
}

export function parseDayKey(value: string): DayKey | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d
    ? (value as DayKey)
    : null;
}