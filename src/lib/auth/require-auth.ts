import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { clientIp } from "./client-info";
import {
  parseSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_END_PATH,
} from "./session";
import {
  loadActiveSession,
  type SessionRecord,
  touchSession,
} from "./session-store";

/**
 * The authoritative answer to "who is asking", and the only one that accounts
 * for revocation — the proxy's check is deliberately optimistic and can still
 * wave through a session that was signed out from another device.
 *
 * Wrapped in React's `cache` so the lookup and its occasional lastSeenAt write
 * happen once per request no matter how many callers ask. That matters here:
 * the root layout asks in order to render the signed-in chrome, the page asks
 * again to guard itself, and every Server Action asks a third time. Without
 * the dedupe each of those is its own round trip to Neon.
 */
export const getSession = cache(async (): Promise<SessionRecord | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  const token = parseSessionToken(cookie);
  if (!token) return null;

  const session = await loadActiveSession(token.sessionId);
  if (!session) return null;

  await touchSession(session, await clientIp());
  return session;
});

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

/**
 * Gates a page, route handler, or Server Action, and hands back the session it
 * verified so callers that care which device is acting don't have to look it
 * up again.
 *
 * Existing callers ignore the return value, which is why this stayed a single
 * call rather than growing a second "and give me the session" variant.
 */
export async function requireAuth(): Promise<SessionRecord> {
  const session = await getSession();
  if (!session) {
    // Not straight to /login: the cookie may still be signed, and the proxy
    // would bounce it back here. See SESSION_END_PATH.
    redirect(SESSION_END_PATH);
  }
  return session;
}
