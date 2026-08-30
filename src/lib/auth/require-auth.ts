import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { clientIp } from "./client-info";
import { clientLocation } from "./geo";
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
 * The authoritative "who is asking" — the only check that accounts for
 * revocation (the proxy's is optimistic). Wrapped in React's `cache` so the
 * layout, the page and each Server Action share one lookup per request.
 */
export const getSession = cache(async (): Promise<SessionRecord | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  const token = parseSessionToken(cookie);
  if (!token) return null;

  const session = await loadActiveSession(token.sessionId);
  if (!session) return null;

  // Header parsing, not round trips; the only write is the throttled one in
  // touchSession.
  await touchSession(session, {
    ip: await clientIp(),
    location: await clientLocation(),
  });
  return session;
});

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

/**
 * Gates a page, route handler, or Server Action, returning the verified
 * session for callers that need to know which device is acting.
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
