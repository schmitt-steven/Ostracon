import "server-only";
import { eq, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";

// Failures allowed before any cooldown kicks in, so ordinary typos don't
// lock the owner out.
const FREE_ATTEMPTS = 5;
// Cooldown owed by each failure past FREE_ATTEMPTS; the last entry repeats
// forever. Edit this to retune the ladder — everything below derives from it.
const COOLDOWN_LADDER_MS = [2, 5, 10, 30].map((minutes) => minutes * 60_000);
const MAX_COOLDOWN_MS = Math.max(...COOLDOWN_LADDER_MS);
// Idle time that clears a streak. Kept clear of the longest cooldown, since a
// streak that expired mid-cooldown would hand the attacker a free reset.
const STREAK_RESET_MS = Math.max(60 * 60_000, MAX_COOLDOWN_MS * 2);

/**
 * Cooldown owed after `failures` consecutive failures: nothing for the first
 * few, then the ladder above (6th failure -> 2m, 7th -> 5m, 8th -> 10m, 9th
 * and beyond -> 30m). The repeating last rung holds a sustained attack to two
 * guesses an hour without ever locking the account permanently.
 */
function cooldownMs(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  const rung = Math.min(
    failures - FREE_ATTEMPTS - 1,
    COOLDOWN_LADDER_MS.length - 1,
  );
  return COOLDOWN_LADDER_MS[rung] ?? MAX_COOLDOWN_MS;
}

function remainingSeconds(failedCount: number, lastFailureAt: Date): number {
  const elapsed = Date.now() - lastFailureAt.getTime();
  if (elapsed >= STREAK_RESET_MS) return 0;
  const remaining = cooldownMs(failedCount) - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * The bucket a login attempt is counted against. There is no username to key
 * on — the app has a single shared password — so the client IP is all we have.
 *
 * This trusts the platform to overwrite `x-forwarded-for` with the real peer
 * address (Vercel does). Behind a proxy that appends rather than replaces, a
 * client could forge the leftmost entry and mint itself a fresh bucket per
 * request; check that before deploying elsewhere. Requests with no forwarded
 * address share the "unknown" bucket, which fails closed.
 */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : "unknown";
}

export type Throttle = { key: string; retryAfter: number };

/** Seconds the caller must wait before their next guess is even looked at. */
export async function checkThrottle(): Promise<Throttle> {
  const key = await clientKey();
  const [row] = await db
    .select({
      failedCount: loginAttempts.failedCount,
      lastFailureAt: loginAttempts.lastFailureAt,
    })
    .from(loginAttempts)
    .where(eq(loginAttempts.ip, key))
    .limit(1);

  if (!row) return { key, retryAfter: 0 };
  return {
    key,
    retryAfter: remainingSeconds(row.failedCount, row.lastFailureAt),
  };
}

/**
 * Records a failed guess and returns the cooldown it just earned. The streak
 * is incremented in the same statement that reads it, so concurrent guesses
 * can't both read the same count and each write back count + 1.
 */
export async function recordFailure(key: string): Promise<number> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STREAK_RESET_MS);

  const [row] = await db
    .insert(loginAttempts)
    .values({ ip: key, failedCount: 1, lastFailureAt: now })
    .onConflictDoUpdate({
      target: loginAttempts.ip,
      set: {
        failedCount: sql`CASE WHEN ${loginAttempts.lastFailureAt} < ${staleBefore} THEN 1 ELSE ${loginAttempts.failedCount} + 1 END`,
        lastFailureAt: now,
      },
    })
    .returning({ failedCount: loginAttempts.failedCount });

  return row ? remainingSeconds(row.failedCount, now) : 0;
}

/**
 * Clears the streak after a correct password. Stale rows from other clients
 * are swept here too, so the table stays bounded without a scheduled job.
 */
export async function clearFailures(key: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, key));
  await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.lastFailureAt, new Date(Date.now() - STREAK_RESET_MS)));
}
