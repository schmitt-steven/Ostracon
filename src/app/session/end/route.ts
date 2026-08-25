import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Clears a session cookie that no longer names a live session and sends the
 * bearer to /login.
 *
 * Reached by redirect from requireAuth, never by a link — see SESSION_END_PATH
 * for why the trip through here is what stops the proxy and the page from
 * redirecting at each other forever. Clearing the cookie is the whole job; a
 * route handler is simply the only place in the request that can do it.
 *
 * Unauthenticated on purpose. Its entire effect is to discard the caller's own
 * credential, so the worst a forged request achieves is signing someone out —
 * and it can't even do that to a session that is still valid, since the cookie
 * this deletes gets sent again by the next login.
 */
export async function GET(request: Request) {
  (await cookies()).delete(SESSION_COOKIE_NAME);
  return NextResponse.redirect(new URL("/login", request.url));
}
