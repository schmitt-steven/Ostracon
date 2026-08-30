import "server-only";
import { and, desc, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { SESSION_MAX_AGE_SECONDS } from "./session";

/**
 * How stale lastSeenAt is allowed to get before a read pays for a write.
 *
 * Every authenticated request already costs one lookup; touching the row on
 * each one would double that to serve a column whose whole purpose is to be
 * read by a human at human resolution. Five minutes is far below "when did I
 * last use this device" and far above "every click".
 */
const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * How long a revoked row is kept after the fact. Long enough that "I signed
 * that iPad out last week" is still answerable, short enough that the table
 * doesn't accumulate.
 */
const REVOKED_RETENTION_MS = 7 * 24 * 60 * 60_000;

export type SessionRecord = typeof sessions.$inferSelect;

/**
 * Everything about the requester that a session row records. Grouped because
 * the two writers — the login that creates a row and the request that touches
 * one — take the same facts, and a shared shape is what keeps the created and
 * last-seen halves of the table describing the same things.
 */
export type ClientFacts = { ip: string; location: string | null };

/**
 * Records a new session and returns its id, which the caller signs into the
 * cookie. Expiry is stamped here so the row and the token agree from birth.
 */
export async function createSession(
  input: ClientFacts & { userAgent: string | null },
): Promise<string> {
  const now = new Date();
  const [row] = await db
    .insert(sessions)
    .values({
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
      createdIp: input.ip,
      createdUserAgent: input.userAgent,
      createdLocation: input.location,
      lastSeenAt: now,
      lastSeenIp: input.ip,
      lastSeenLocation: input.location,
    })
    .returning({ id: sessions.id });

  // The insert either returns a row or throws; this satisfies the type without
  // inventing a fallback that would hand out an unusable cookie.
  if (!row) throw new Error("Failed to create session");
  return row.id;
}

/**
 * The session behind a verified token, or null if it is no longer current —
 * revoked from any device, or past its deadline.
 *
 * The id is only ever supplied by parseSessionToken, so this is a lookup, not
 * a check of whether the caller may name that id.
 */
export async function loadActiveSession(
  id: string,
): Promise<SessionRecord | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, id),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Marks a session used. Skips the write unless lastSeenAt has gone stale, so
 * the common request pays nothing.
 *
 * The location is written alongside the address rather than checked against
 * the row the way the address is: it is *derived* from that address, so a
 * moved session is already caught by the comparison above it, and a row whose
 * location is still null because it predates the column gets backfilled at the
 * next stale read rather than never.
 */
export async function touchSession(
  session: SessionRecord,
  client: ClientFacts,
): Promise<void> {
  const now = new Date();
  if (
    now.getTime() - session.lastSeenAt.getTime() < TOUCH_INTERVAL_MS &&
    session.lastSeenIp === client.ip
  ) {
    return;
  }
  await db
    .update(sessions)
    .set({
      lastSeenAt: now,
      lastSeenIp: client.ip,
      lastSeenLocation: client.location,
    })
    .where(eq(sessions.id, session.id));
}

/**
 * Signs one session out. Idempotent, and a no-op against an id that isn't
 * there — revoking twice, or revoking something already swept, is not an
 * error worth surfacing.
 */
export async function revokeSession(id: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
}

/**
 * "Sign out my other devices" — every live session except the one asking.
 * Keeping the caller signed in is the point: the alternative logs you out of
 * the device you're using to do the tidying.
 */
export async function revokeOtherSessions(keepId: string): Promise<number> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(ne(sessions.id, keepId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.length;
}

/**
 * The sessions that are currently signed in, newest activity first.
 *
 * Live ones only — not revoked, not expired. Rows stay in the table after
 * being signed out (see revokeSession, and REVOKED_RETENTION_MS above), but
 * that is for the sake of *this instance's* record, not the reader's: what the
 * settings list is for is deciding which devices to sign out, and a device
 * that is already signed out is nothing to decide about. Printed anyway it
 * would be a greyed row that outnumbers the live ones within a week of
 * ordinary use, on a page whose entire point is to be scanned.
 */
export async function listSessions(): Promise<SessionRecord[]> {
  return db
    .select()
    .from(sessions)
    .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
}

/**
 * Drops rows nothing will ask about again. Called on successful login, so the
 * table stays bounded without a scheduled job.
 */
export async function pruneSessions(): Promise<void> {
  const now = new Date();
  await db
    .delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, now),
        lt(sessions.revokedAt, new Date(now.getTime() - REVOKED_RETENTION_MS)),
      ),
    );
}
