import "server-only";
import { headers } from "next/headers";

/**
 * The client's address, as best the platform will tell us.
 *
 * This trusts the platform to overwrite `x-forwarded-for` with the real peer
 * address (Vercel does). Behind a proxy that appends rather than replaces, a
 * client could forge the leftmost entry; check that before deploying
 * elsewhere. What that costs depends on the caller: the login throttle keys
 * its buckets on this, so a forgeable value hands an attacker a fresh bucket
 * per request, while the session table only records it for display.
 *
 * Requests with no forwarded address share the "unknown" value, which fails
 * closed for the throttle.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : "unknown";
}

/** Truncated so one long header can't write an oversized row. */
export async function clientUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}
