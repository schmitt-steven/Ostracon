import "server-only";
import { headers } from "next/headers";

/**
 * The client's address. Trusts the platform to overwrite `x-forwarded-for`
 * with the real peer address (Vercel does) — behind a proxy that appends, the
 * leftmost entry is forgeable, which matters because the login throttle keys
 * on this. No forwarded address -> "unknown", which fails closed.
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
