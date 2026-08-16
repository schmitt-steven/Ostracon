"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logFailure, pruneFailureLog } from "./failure-log";
import {
  makeSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./session";
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
    return cooldown > 0 ? throttled(cooldown) : { error: "Incorrect password." };
  }
  await clearFailures(key);
  await pruneFailureLog();

  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, makeSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
