import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "skb_session";

/**
 * Where a request goes when its cookie is well-formed but its session is no
 * longer current — revoked from another device, most likely.
 *
 * It exists because the two halves of the check disagree in exactly that case.
 * The proxy can only see that the cookie is signed, so it bounces the bearer
 * away from /login as though they were signed in; the page then finds no live
 * session and sends them back. That is a loop, and it lasts as long as the
 * dead cookie does. Neither end can break it: a Server Component can't clear a
 * cookie, and clearing it in the proxy would mean the database lookup the
 * proxy is meant to avoid. A route handler can, so the redirect goes there
 * first and reaches /login without the cookie.
 */
export const SESSION_END_PATH = "/session/end";

/**
 * Signed into every token and checked on the way back in. Bumping it rejects
 * every session issued under the previous value without rotating
 * SESSION_SECRET.
 *
 * With sessions now recorded in the database this is no longer the only "sign
 * out everywhere" lever — revoking rows does the same thing without
 * invalidating the deployment's own notion of a valid token — but it stays as
 * the blunt instrument for when the *format* changes, which is what took it
 * from v1 to v2: v1 tokens carry no session id, so there is no row to look
 * them up by and no way to manage them. They fail the parse below on shape
 * alone; the bump just makes the break explicit.
 */
const SESSION_VERSION = "v2";

// Exported so the cookie's maxAge is set from the same number the server
// enforces — a cookie that outlives the token would just mean silent redirects
// to /login, and one that dies early would log you out for no reason. The
// session row's expiresAt is derived from it too, so all three agree.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

// Tolerance for a token minted moments ago on an instance whose clock runs a
// little ahead of the one now reading it.
const CLOCK_SKEW_MS = 60_000;

// The id is interpolated into a uuid-typed query, so a malformed one would
// reach Postgres as a cast error rather than a miss. Only a token bearing our
// own signature gets that far, so this is belt-and-braces — but it's a regex
// against a string, and the alternative is a 500.
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
 * Everything about a cookie that can be established without touching the
 * database: that we minted it, that it hasn't expired, and which session row
 * it names.
 *
 * Deliberately *not* the whole answer. The row this points at may have been
 * revoked since, which only a lookup can tell you — see lib/auth/require-auth
 * for the gate that does. Kept free of database work so the proxy can run it
 * on every request as an optimistic check, which is the one thing Next.js
 * says proxy is good for.
 */
export function parseSessionToken(value: string): SessionToken | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [version, sessionId, issuedAt, signature] = parts;
  if (!version || !sessionId || !issuedAt || !signature) return null;
  if (version !== SESSION_VERSION) return null;

  // The signature is checked before anything else is read, so the fields below
  // are known to be the values this server issued rather than ones the client
  // chose.
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
