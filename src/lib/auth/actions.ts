"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientUserAgent } from "./client-info";
import { logFailure, pruneFailureLog } from "./failure-log";
import { getSession } from "./require-auth";
import {
  makeSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./session";
import { createSession, pruneSessions, revokeSession } from "./session-store";
import { checkThrottle, clearFailures, recordFailure } from "./throttle";

function passwordsMatch(submitted: string, expected: string): boolean {
  const a = createHash("sha256").update(submitted).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** `retryAfter` is seconds of cooldown left; the form counts it down. */
export type LoginState = { error: string; retryAfter?: number } | undefined;

const throttled = (retryAfter: number): LoginState => ({
  error: "Too many failed attempts.",
  retryAfter,
});

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Checked before the password is read: while a client is cooling down its
  // guesses aren't compared at all, so the endpoint reveals nothing.
  const { key, retryAfter } = await checkThrottle();
  if (retryAfter > 0) return throttled(retryAfter);

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    // An empty submit is a slip, not a guess — it doesn't count against the
    // streak.
    return { error: "Enter your password." };
  }
  if (!passwordsMatch(password, process.env.APP_PASSWORD!)) {
    // Only evaluated guesses are logged — attempts made during a cooldown
    // return above — so the throttle bounds how fast this table can grow.
    await logFailure(key, password);
    const cooldown = await recordFailure(key);
    return cooldown > 0
      ? throttled(cooldown)
      : { error: "Incorrect password." };
  }
  await clearFailures(key);
  await pruneFailureLog();
  await pruneSessions();

  // `key` is the same client address the throttle bucketed this attempt
  // against, so a session and the failures that preceded it are attributable
  // to each other.
  const sessionId = await createSession({
    ip: key,
    userAgent: await clientUserAgent(),
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, makeSessionToken(sessionId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  // Revoked as well as deleted. Dropping the cookie only disarms the browser
  // doing it; without the revocation the token stays signed and valid for the
  // rest of its month, so a copy of it taken beforehand would still work.
  const session = await getSession();
  if (session) await revokeSession(session.id);

  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
