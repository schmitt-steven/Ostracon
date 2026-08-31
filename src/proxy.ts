import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * An optimistic check only: the cookie carries our signature and hasn't aged
 * out — enough to keep signed-out traffic off every route without a DB hit.
 * requireAuth settles whether the session is still current; a revoked cookie
 * gets past this and no further, and is cleared via SESSION_END_PATH.
 */
export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValid = cookie ? parseSessionToken(cookie) !== null : false;
  const isLoginPath = request.nextUrl.pathname === "/login";

  if (!isValid && !isLoginPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isValid && isLoginPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

/**
 * Everything excluded here is a static, secretless file that has to be
 * reachable *without* a session, or the app stops being installable:
 *
 *   manifest.webmanifest  Chrome fetches it with `credentials: "omit"`, so
 *                         even a signed-in reader's request arrives cookieless.
 *                         Redirected to /login it parses as HTML, and the
 *                         install prompt never appears.
 *   sw.js, offline.html   Fetched by the service worker, outside any page.
 *   icon, apple-icon      The app-icon conventions, served from /app.
 *   icons/               The manifest's own icons, named by the manifest.
 *
 * favicon.ico was already here for the same reason.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|offline\\.html|icons/|icon|apple-icon).*)",
  ],
};
