import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Clears a dead session cookie and redirects to /login. Reached by redirect
 * from requireAuth (see SESSION_END_PATH — this breaks the proxy/page redirect
 * loop); a route handler is the only place that can clear a cookie.
 * Unauthenticated on purpose — its only effect is discarding the caller's own
 * cookie.
 */
export async function GET(request: Request) {
  (await cookies()).delete(SESSION_COOKIE_NAME);
  return NextResponse.redirect(new URL("/login", request.url));
}
