import "server-only";
import { headers } from "next/headers";

/**
 * Where the request came from, as `Frankfurt, Germany`, from the headers
 * Vercel's edge attaches — no IP-geolocation call. Returns a formatted string
 * because a session row stores where a device *was*, which can't be
 * re-derived later. Null off Vercel (`next dev`); the sessions table falls
 * back to the address there.
 */
export async function clientLocation(): Promise<string | null> {
  const h = await headers();

  // Percent-encoded by the edge — city names have spaces and accents.
  const city = decode(h.get("x-vercel-ip-city"));
  const country = countryName(h.get("x-vercel-ip-country"));

  const label = [city, country].filter(Boolean).join(", ");
  // Truncated — it's a header, and a header is whatever arrives.
  return label ? label.slice(0, 120) : null;
}

function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape isn't worth an exception; the raw value still prints.
    return value;
  }
}

/**
 * `DE` → `Germany`. Pinned to English, not the server locale, because the
 * result is stored and read back elsewhere. Unrecognised codes print as
 * themselves.
 */
function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
