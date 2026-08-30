import "server-only";
import { and, desc, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { SESSION_MAX_AGE_SECONDS } from "./session";

// How stale lastSeenAt may get before a read pays for a write. lastSeenAt is
// read at human resolution, so 5 minutes costs nothing anyone would notice.
const TOUCH_INTERVAL_MS = 5 * 60_000;

// How long a revoked row is kept, so "I signed that iPad out last week" stays
// answerable without the table growing forever.
const REVOKED_RETENTION_MS = 7 * 24 * 60 * 60_000;

export type SessionRecord = typeof sessions.$inferSelect;

/**
 * The requester facts a session row records. Shared shape between the two
 * writers (create and touch) so the created and last-seen columns line up.
 */
export type ClientFacts = { ip: string; location: string | null };

/**
 * Records a new session and returns its id for the cookie. Expiry is stamped
 * here so the row and the token agree from birth.
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

  if (!row) throw new Error("Failed to create session");
  return row.id;
}

/**
 * The session behind a verified token, or null if it's revoked or expired.
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
 * Marks a session used, skipping the write unless lastSeenAt has gone stale or
 * the address changed. Location rides along with the address rather than being
 * compared (it's derived from it).
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

/** Signs one session out. Idempotent; a no-op against an unknown id. */
export async function revokeSession(id: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
}

/** "Sign out my other devices" — every live session except `keepId`. */
export async function revokeOtherSessions(keepId: string): Promise<number> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(ne(sessions.id, keepId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.length;
}

/**
 * The currently signed-in sessions, newest activity first. Live only — revoked
 * rows are kept for the record (REVOKED_RETENTION_MS) but not shown.
 */
export async function listSessions(): Promise<SessionRecord[]> {
  return db
    .select()
    .from(sessions)
    .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
}

/** Drops expired and long-revoked rows. Called on login, in place of a cron. */
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
