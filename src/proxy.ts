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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
