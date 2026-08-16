import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "skb_session";

// Signed into every token and checked on the way back in. Bumping it rejects
// every session issued under the previous value, which is the "sign out
// everywhere" lever: use it if a cookie is ever copied off a machine, without
// having to rotate SESSION_SECRET.
const SESSION_VERSION = "v1";

// Exported so the cookie's maxAge is set from the same number the server
// enforces — a cookie that outlives the token would just mean silent redirects
// to /login, and one that dies early would log you out for no reason.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

// Tolerance for a token minted moments ago on an instance whose clock runs a
// little ahead of the one now reading it.
const CLOCK_SKEW_MS = 60_000;

function sign(payload: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payload)
    .digest("hex");
}

export function makeSessionToken(): string {
  const payload = `${SESSION_VERSION}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export async function verifySessionCookie(value: string): Promise<boolean> {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [version, issuedAt, signature] = parts;
  if (!version || !issuedAt || !signature) return false;
  if (version !== SESSION_VERSION) return false;

  // The signature is checked before the timestamp is read, so `issuedAt` is
  // known to be the value this server issued rather than one the client chose.
  const expected = sign(`${version}.${issuedAt}`);
  if (signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }

  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age)) return false;
  if (age > SESSION_MAX_AGE_MS) return false;
  // Comfortably-future timestamps mean a clock problem, not a valid session.
  if (age < -CLOCK_SKEW_MS) return false;
  return true;
}
