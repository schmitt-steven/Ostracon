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
  const credential = await loadCredential();
  if (!(await verifyPassword(password, credential))) {
    const cooldown = await recordFailure(key);
    return cooldown > 0
      ? throttled(cooldown)
      : { error: "Incorrect password." };
  }
  await clearFailures(key);
  await pruneSessions();

  // `key` is the same client address the throttle bucketed this attempt
  // against, so the session records the address the login actually came from.
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
 * Moves the password from the environment into the database, or from one
 * database value to the next. See lib/auth/password for where it ends up and
 * why it stops being readable once it gets there.
 *
 * **The current password is asked for even though the caller is signed in.** A
 * session is a month-long cookie on a machine that gets left unlocked; the
 * password is the thing that machine's owner knows. Without the check, changing
 * the password would be the one action anybody who sits down at an open tab can
 * take that locks the real owner out — and it is precisely the action that
 * needs the most confidence about who is asking.
 *
 * That check is a guess against the real password, so it goes through the login
 * throttle, on the same bucket and the same ladder. An attacker who can reach
 * this action can already reach /login; what would be unreasonable is leaving
 * one of the two doors uncounted.
 *
 * **Other devices are signed out**, and that is the point rather than a side
 * effect. Sessions survive a password change on their own signature — changing
 * the password to shut somebody out while their cookie keeps working for
 * another month would be a change that does nothing. The device asking keeps
 * its own session, because logging the owner out of the tab they just used to
 * do this is a punishment for good hygiene.
 */
export async function changePasswordAction(
  input: unknown,
): Promise<ChangePasswordResult> {
  // Loud rather than a redirect: this is a mutation invoked from a dialog, and
  // the dialog can say so where a navigation mid-transition would just look
  // like the button did nothing.
  const session = await requireAuth();

  const parsed = ChangePasswordInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Couldn't read that." };
  const { current, next } = parsed.data;

  const { key, retryAfter } = await checkThrottle();
  if (retryAfter > 0) {
    return { ok: false, error: "Too many failed attempts.", retryAfter };
  }

  // Length is checked before the current password is looked at, so a refused
  // change tells you about the field you got wrong rather than about the other
  // one. Neither of these can be reached through the dialog, which disables the
  // button until both hold — they are here because a Server Action is a public
  // endpoint whatever the UI in front of it does.
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

  // The page behind the dialog carries "last changed" — refreshed rather than
  // revalidated because nothing about /settings is cached; what has to be
  // re-read is the row this action just wrote.
  refresh();
  return { ok: true, signedOut };
}

const SessionIdInput = z.uuid();

export type RevokeSessionResult = { ok: true } | { ok: false; error: string };

/**
 * Signs one other device out, named by the row the settings list is showing.
 *
 * **The id comes from the client, which is what makes this different from
 * everything else in this file.** Every other action here acts on the caller's
 * own session; this one acts on a row the caller picked. That is safe only
 * because there is exactly one account — the sessions table holds this owner's
 * devices and nobody else's, so "may they revoke that id" has the same answer
 * as "are they signed in", which [requireAuth] has already established. If this
 * app ever grows a second user, this is the line that has to grow a check that
 * the row belongs to them.
 *
 * The id is still validated as a uuid before it reaches the query. A malformed
 * one would arrive at Postgres as a cast error rather than as a miss — the
 * same guard [parseSessionToken] keeps, for the same reason.
 *
 * **Revoking your own session logs you out**, rather than being refused. It is
 * the same revocation as any other row's, and the only thing that made it worth
 * treating separately was the risk of leaving the reader on a page they are no
 * longer allowed to see. So it doesn't: the cookie goes with the row and the
 * redirect lands on /login, which is exactly where the rail's Log out button
 * would have put them. A device is a device, including this one.
 */
export async function revokeSessionAction(
  id: unknown,
): Promise<RevokeSessionResult> {
  const session = await requireAuth();

  const parsed = SessionIdInput.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Couldn't read that." };

  // Everything [logoutAction] does, for the same reason it does it: the cookie
  // has to be dropped alongside the revocation or this browser keeps presenting
  // a token that is signed and dead, and the redirect has to happen here
  // because the page this was pressed on is now behind the login wall. The
  // redirect throws, so nothing below runs.
  if (parsed.data === session.id) {
    await revokeSession(session.id);
    const jar = await cookies();
    jar.delete(SESSION_COOKIE_NAME);
    redirect("/login");
  }

  // A no-op against an id that was already revoked or swept, which is the
  // likely outcome of two tabs showing the same stale list. Reported as
  // success: the device is signed out either way, and that is what was asked
  // for.
  await revokeSession(parsed.data);

  // The list is rendered by /settings from a query, not a cache, so what has
  // to happen is a re-render rather than an invalidation — the same call
  // changePasswordAction makes for the same reason.
  refresh();
  return { ok: true };
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
