import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValid = cookie ? await verifySessionCookie(cookie) : false;
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
