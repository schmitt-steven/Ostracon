import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "skb_session";

/**
 * Where a signed-but-dead cookie is sent to be cleared. Only a route handler
 * can clear a cookie, so without this the proxy and /login bounce it forever.
 */
export const SESSION_END_PATH = "/session/end";

/** Signed into every token. Bump to reject every existing session on a token
 * format change without rotating SESSION_SECRET. */
const SESSION_VERSION = "v2";

// The cookie maxAge, the token age check and the session row's expiresAt are
// all derived from this one number so they agree.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

// Tolerance for a token minted moments ago on an instance whose clock runs a
// little ahead of the one now reading it.
const CLOCK_SKEW_MS = 60_000;

// The id is interpolated into a uuid-typed query; a malformed one would reach
// Postgres as a cast error (a 500) rather than a miss.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(payload: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payload)
    .digest("hex");
}

export function makeSessionToken(sessionId: string): string {
  const payload = `${SESSION_VERSION}.${sessionId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** A token that carried our signature and hasn't aged out. */
export type SessionToken = { sessionId: string; issuedAt: number };

/**
 * What a cookie proves without a database hit: that we minted it, that it
 * hasn't expired, and which session row it names. The row may still have been
 * revoked — see lib/auth/require-auth for the lookup that checks. Kept
 * DB-free so the proxy can run it on every request.
 */
export function parseSessionToken(value: string): SessionToken | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [version, sessionId, issuedAt, signature] = parts;
  if (!version || !sessionId || !issuedAt || !signature) return null;
  if (version !== SESSION_VERSION) return null;

  // Checked before any field below is trusted.
  const expected = sign(`${version}.${sessionId}.${issuedAt}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  if (!UUID_RE.test(sessionId)) return null;

  const issued = Number(issuedAt);
  const age = Date.now() - issued;
  if (!Number.isFinite(age)) return null;
  if (age > SESSION_MAX_AGE_MS) return null;
  // Comfortably-future timestamps mean a clock problem, not a valid session.
  if (age < -CLOCK_SKEW_MS) return null;
  return { sessionId, issuedAt: issued };
}
