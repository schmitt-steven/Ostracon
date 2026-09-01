"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientUserAgent } from "./client-info";
import { clientLocation } from "./geo";
import { loadCredential, setPassword, verifyPassword } from "./password";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password-policy";
import { getSession, requireAuth } from "./require-auth";
import {
  makeSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./session";
import {
  createSession,
  pruneSessions,
  revokeOtherSessions,
  revokeSession,
} from "./session-store";
import { checkThrottle, clearFailures, recordFailure } from "./throttle";

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
  // Before the password is read — a cooling-down client's guesses aren't
  // compared at all.
  const { key, retryAfter } = await checkThrottle();
  if (retryAfter > 0) return throttled(retryAfter);

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    // An empty submit is a slip — it doesn't count against the streak.
    return { error: "Enter your password." };
  }
  const credential = await loadCredential();
  if (!(await verifyPassword(password, credential))) {
    const cooldown = await recordFailure(key);
    return cooldown > 0
      ? throttled(cooldown)
      : { error: "Incorrect password." };
  }
  await clearFailures(key);
  await pruneSessions();

  // `key` is the throttle's client address — the session records where the
  // login came from.
  const sessionId = await createSession({
    ip: key,
    location: await clientLocation(),
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

const ChangePasswordInput = z.object({
  current: z.string().max(MAX_PASSWORD_LENGTH * 4),
  next: z.string().max(MAX_PASSWORD_LENGTH * 4),
});

export type ChangePasswordResult =
  | { ok: true; signedOut: number }
  | { ok: false; error: string; retryAfter?: number };

/**
 * Moves the password into the database (see lib/auth/password). The current
 * password is required and checked through the login throttle — it's the one
 * open-tab action that could lock the real owner out. Other devices are then
 * signed out (or the change would do nothing); this one stays signed in.
 */
export async function changePasswordAction(
  input: unknown,
): Promise<ChangePasswordResult> {
  // Loud, not a redirect — this is invoked from a dialog that can show the error.
  const session = await requireAuth();

  const parsed = ChangePasswordInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Couldn't read that." };
  const { current, next } = parsed.data;

  const { key, retryAfter } = await checkThrottle();
  if (retryAfter > 0) {
    return { ok: false, error: "Too many failed attempts.", retryAfter };
  }

  // Length before the current password, so the error names the right field.
  // The dialog blocks these already; a Server Action is a public endpoint.
  if (next.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (next.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }

  const credential = await loadCredential();
  if (!(await verifyPassword(current, credential))) {
    const cooldown = await recordFailure(key);
    return cooldown > 0
      ? { ok: false, error: "Too many failed attempts.", retryAfter: cooldown }
      : { ok: false, error: "That isn't your current password." };
  }

  if (await verifyPassword(next, credential)) {
    return { ok: false, error: "That's already your password." };
  }

  await clearFailures(key);
  await setPassword(next);
  const signedOut = await revokeOtherSessions(session.id);

  // Re-render /settings so its "last changed" line reflects the new row.
  refresh();
  return { ok: true, signedOut };
}

const SessionIdInput = z.uuid();

export type RevokeSessionResult = { ok: true } | { ok: false; error: string };

/**
 * Signs one device out, by the id the settings list gives. The id is
 * client-supplied — safe only because there's one account (a second user would
 * need an ownership check here). Validated as a uuid before the query.
 * Revoking your own session logs you out, like the sidebar's Log out button.
 */
export async function revokeSessionAction(
  id: unknown,
): Promise<RevokeSessionResult> {
  const session = await requireAuth();

  const parsed = SessionIdInput.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Couldn't read that." };

  // Own session: revoke, drop the cookie, redirect (the page is now behind
  // the login wall). The redirect throws.
  if (parsed.data === session.id) {
    await revokeSession(session.id);
    const jar = await cookies();
    jar.delete(SESSION_COOKIE_NAME);
    redirect("/login");
  }

  // A no-op against an already-revoked id (two stale tabs) is still success.
  await revokeSession(parsed.data);

  refresh();
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  // Revoked as well as deleted — dropping the cookie alone leaves the token
  // signed and valid for the rest of its month.
  const session = await getSession();
  if (session) await revokeSession(session.id);

  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
