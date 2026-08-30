/**
 * A user-agent string reduced to `Safari on iPhone` — enough for the sessions
 * list's "is that one of mine". A small hand table, not a parser. Pure; takes
 * the raw header. Not a security boundary — a user agent is whatever the
 * client claims.
 */

/**
 * Marker → name, in match order (not alphabetical): specific claims before
 * generic, or every Chromium browser comes out as Safari. The `*iOS` suffixes
 * are the only thing telling iOS browsers apart.
 */
const BROWSERS: [marker: string, name: string][] = [
  ["Edg/", "Edge"],
  ["EdgiOS/", "Edge"],
  ["OPR/", "Opera"],
  ["SamsungBrowser/", "Samsung Internet"],
  ["CriOS/", "Chrome"],
  ["FxiOS/", "Firefox"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Chromium/", "Chrome"],
  ["Safari/", "Safari"],
];

/**
 * The same, for the machine. iPhone/iPad before Mac OS X (every iOS string
 * carries it); Android before Linux. No iPadOS entry — Safari on iPad reports
 * as `Macintosh` and no header says otherwise, so iPads show as macOS.
 */
const PLATFORMS: [marker: string, name: string, kind: DeviceKind][] = [
  ["iPhone", "iPhone", "mobile"],
  ["iPad", "iPad", "mobile"],
  ["Android", "Android", "mobile"],
  ["CrOS", "ChromeOS", "desktop"],
  ["Macintosh", "macOS", "desktop"],
  ["Mac OS X", "macOS", "desktop"],
  ["Windows", "Windows", "desktop"],
  ["Linux", "Linux", "desktop"],
];

/** Device shape for the sessions-list icon. Two buckets, no tablet — a phone
 * and a laptop are the two silhouettes that read at a glance. */
export type DeviceKind = "desktop" | "mobile";

function match<T extends readonly [string, ...unknown[]]>(
  ua: string,
  table: readonly T[],
): T | null {
  for (const row of table) {
    if (ua.includes(row[0])) return row;
  }
  return null;
}

/**
 * `Safari on iPhone`, or as much as the string supports (either half alone, or
 * null when nothing is recognised — the table prints "Unknown device").
 */
export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;

  const browser = match(userAgent, BROWSERS)?.[1] ?? null;
  const platform = match(userAgent, PLATFORMS)?.[1] ?? null;

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform;
}

/**
 * A phone or a computer, or null when the header doesn't decide it — the
 * sessions list draws no icon rather than guessing.
 */
export function deviceKind(userAgent: string | null): DeviceKind | null {
  if (!userAgent) return null;
  return match(userAgent, PLATFORMS)?.[2] ?? null;
}
