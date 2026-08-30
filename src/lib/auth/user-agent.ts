/**
 * A user-agent string, reduced to the words a person would use for the machine
 * that sent it: `Safari on iPhone`.
 *
 * Deliberately a small hand-written table rather than a parsing library. What
 * the sessions list has to answer is "is that one of mine, or is it someone
 * else's" — a question you settle by recognising your own phone, not by
 * knowing which point release of WebKit it runs. Every extra field a real
 * parser returns is another thing that has to be laid out in a 640px column,
 * and none of them helps with that question.
 *
 * Pure, and takes the raw header, so the caller decides whose it is. Nothing
 * here is a security boundary: a user agent is whatever the client claims, and
 * the only thing this label is trusted to do is jog a memory.
 */

/**
 * Marker → name, in the order they have to be tried.
 *
 * The order is the whole trick and it is not alphabetical. Every Chromium
 * browser says `Chrome` somewhere in its string and every Chromium browser on
 * a Mac also says `Safari`, so the specific claims have to be read before the
 * generic ones — Edge before Chrome, Chrome before Safari — or everything
 * comes out as Safari.
 *
 * The iOS entries are the same rule from the other side: on iOS every browser
 * is WebKit and has to say so, and the two-letter suffix (`CriOS`, `FxiOS`) is
 * the only thing distinguishing Chrome-on-iPhone from Safari-on-iPhone.
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
 * The same, for the machine underneath.
 *
 * `iPhone` and `iPad` come before `Mac OS X`, which every iOS string also
 * carries. Android comes before Linux for the same reason.
 *
 * **iPadOS is missing on purpose, because it cannot be found here.** Safari on
 * an iPad has reported itself as `Macintosh` since iPadOS 13 and there is no
 * header that says otherwise — the only tell is a touch-capable Macintosh,
 * which is a measurement the browser can make and the server cannot. So an
 * iPad shows up as macOS, and the owner's remedy is the `label` column: a name
 * you give a device beats anything that can be inferred from its claims.
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

/**
 * Which of the two shapes a device has, for the icon the sessions list prints
 * beside its name.
 *
 * **Two buckets and no third, which is a decision about the icon rather than
 * about the machines.** A tablet is neither and both, and drawing it as a
 * third glyph would ask the reader to tell three rounded rectangles apart in a
 * 14px column to learn something they already know from the words next to it.
 * The icon is there to be recognised at a glance from across the row — is that
 * one of mine — and a phone and a laptop are the two silhouettes that do that.
 *
 * The iPad lands under `mobile` when it says so, which in practice is almost
 * never: Safari on iPadOS has claimed to be a Macintosh since version 13, so
 * most iPads arrive here as macOS and get the desktop glyph. That is the same
 * limitation [describeDevice] carries and it has the same remedy — a name the
 * owner gives the device beats anything inferred from its claims.
 */
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
 * `Safari on iPhone`, or as much of it as the string supports.
 *
 * Half an answer is still an answer — `Chrome` on an unrecognised platform, or
 * `Windows` from something that isn't a browser at all — so the two halves are
 * joined only when both are there. Null means the header said nothing usable,
 * which the table prints as "Unknown device" rather than as an empty cell; a
 * blank there would read as a rendering fault rather than as a fact.
 */
export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;

  const browser = match(userAgent, BROWSERS)?.[1] ?? null;
  const platform = match(userAgent, PLATFORMS)?.[1] ?? null;

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform;
}

/**
 * A phone or a computer, or null when the header said nothing that decides it.
 *
 * Null is a real answer and not a failure: it is what an unrecognised platform
 * and a missing header both come to, and the sessions list draws nothing there
 * rather than guessing. An icon is a claim about the device, and a wrong claim
 * beside an unfamiliar row is exactly the wrong place to make one — the reader
 * is there to decide whether that session is theirs.
 */
export function deviceKind(userAgent: string | null): DeviceKind | null {
  if (!userAgent) return null;
  return match(userAgent, PLATFORMS)?.[2] ?? null;
}
