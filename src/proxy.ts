import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * An optimistic check, and only that: it establishes that a cookie carries our
 * signature and hasn't aged out, which is enough to keep signed-out traffic
 * off every route without a database round trip on every request. Whether the
 * session is still *current* — not revoked from another device — is settled by
 * requireAuth at the point the data is actually reached. Next.js is explicit
 * that proxy shouldn't be a full authorization solution, and a lookup here
 * would be one per request including every RSC fetch.
 *
 * The gap is deliberate and bounded: a revoked cookie gets past this and no
 * further, and requireAuth routes it through SESSION_END_PATH to be cleared.
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
