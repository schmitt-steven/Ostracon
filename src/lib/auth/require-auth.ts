import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "./session";

export async function isAuthenticated(): Promise<boolean> {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return cookie ? await verifySessionCookie(cookie) : false;
}

export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
}
