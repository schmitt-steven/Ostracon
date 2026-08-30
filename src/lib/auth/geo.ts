import "server-only";
import { headers } from "next/headers";

/**
 * Where the request came from, in place names: `Frankfurt, Germany`.
 *
 * Read off the headers Vercel's edge attaches, which is the only source
 * available — there is no IP-geolocation call here and there shouldn't be. A
 * lookup would mean a third-party round trip on the login path, an API key to
 * keep, and this app's readers' addresses being handed to a company that has
 * no other reason to know them. The platform has already done the work for
 * free, before the request reached any code of ours.
 *
 * **The answer is stored rather than derived at render time**, which is why
 * this returns a formatted string instead of its parts. A session row is a
 * record of where a device *was* when it signed in and when it was last seen;
 * re-deriving that later would need the address to still resolve to the same
 * place, and the whole point of keeping it is that it might not.
 *
 * Off the platform — `next dev`, or anywhere that isn't Vercel — the headers
 * are absent and this is null. That's honest: the sessions table prints the
 * address instead, which is the only locating fact there is locally.
 */
export async function clientLocation(): Promise<string | null> {
  const h = await headers();

  // Percent-encoded by the edge, because city names have spaces and accents in
  // them and a header value can carry neither.
  const city = decode(h.get("x-vercel-ip-city"));
  const country = countryName(h.get("x-vercel-ip-country"));

  const label = [city, country].filter(Boolean).join(", ");
  // Truncated for the same reason the user agent is: this is a header, and a
  // header is whatever arrives.
  return label ? label.slice(0, 120) : null;
}

function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape is not worth an exception on the login path; the raw
    // value is still readable enough to print.
    return value;
  }
}

/**
 * `DE` → `Germany`.
 *
 * Pinned to English rather than the server's locale, because the result is
 * written to a row that outlives this request and is read back by a page that
 * has no idea what locale produced it. A column where half the rows say
 * "Germany" and half say "Deutschland" — because the deployment region changed
 * between two logins — would be a worse answer than either.
 *
 * An unrecognised code prints as itself. `Intl.DisplayNames` returns the input
 * unchanged for those, which is exactly the fallback wanted, and `of` throws on
 * a code that isn't two letters at all.
 */
function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
