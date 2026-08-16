import "server-only";
import { createHmac } from "node:crypto";
import { lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { loginFailures } from "@/db/schema";

/**
 * What a failed guess is worth recording, and what it isn't.
 *
 * A guess is stored in full only once it's far enough from the real password to
 * rule out an owner typo. A near-miss is a copy of the real password give or
 * take a character, and writing that down would put a credential that unlocks
 * *other* services into a table reachable by anything holding DATABASE_URL —
 * Vercel's build env, the Neon console, backups, drizzle-kit. Losing the
 * database already costs you every note, so the password buys an attacker
 * nothing here; the risk being avoided is entirely about blast radius
 * elsewhere. Distant guesses carry no such risk, so they're kept verbatim.
 *
 * The columns that work regardless:
 *
 *   - "was that me?" -> `distance`. An edit distance of 1-2 is a typo; 20 is a
 *     stranger.
 *   - "one bot retrying, or a dictionary run?" -> `fingerprint`. Repeats of one
 *     guess collapse to one value; a dictionary attack shows all-distinct ones.
 *   - "who and when?" -> `ip`, `userAgent`, `attemptedAt`.
 *
 * `distance` does leak a little: it bounds the real password's length, since a
 * distance can't be smaller than the difference in lengths. That's a far cry
 * from the password itself, and it's the price of the "was that me" signal.
 */

// Guesses longer than this skip the distance comparison. Server Actions accept
// a 1MB body by default, and the edit-distance table is O(n*m) — without a
// bound, one oversized guess is a cheap way to burn server CPU.
const MAX_COMPARE_LEN = 128;
// How much longer than the real password a guess can be and still be treated
// as a possible typo of it. Anything past this differs from the real password
// by more than TYPO_SLACK edits on length alone.
const TYPO_SLACK = 64;
// Distance at or above which a guess is far enough from the real password to
// be worth keeping verbatim. Six is comfortably past any realistic typo,
// caps-lock slip, or trailing character.
const MIN_DISTANCE_TO_STORE = 6;
// Stored guesses are truncated: an unbounded guess is a 1MB row.
const MAX_STORED_GUESS_LEN = 256;
const RETENTION_MS = 30 * 24 * 60 * 60_000;

/**
 * Levenshtein distance, two-row DP. Indices are bounded by the loops, so the
 * non-null assertions hold.
 */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, substitution);
    }
    prev = curr;
  }
  return prev[b.length]!;
}

/**
 * Keyed so the fingerprint can't be reversed with a rainbow table — a bare
 * sha256 of a weak password is recoverable in seconds. The key is derived from
 * SESSION_SECRET rather than being SESSION_SECRET, so this use is domain-
 * separated from session signing.
 */
function fingerprint(guess: string): string {
  const key = createHmac("sha256", process.env.SESSION_SECRET!)
    .update("login-failure-fingerprint")
    .digest();
  return createHmac("sha256", key).update(guess).digest("hex").slice(0, 32);
}

export async function logFailure(ip: string, guess: string): Promise<void> {
  const expected = process.env.APP_PASSWORD!;
  // The limit has to clear the real password's own length, not just the fixed
  // ceiling: with a 161-character password, the owner's typo is a 162-character
  // guess, and skipping the comparison there would leave `distance` null — read
  // below as "definitely not a typo" — and write that near-miss down in full.
  // `expected` isn't attacker-controlled, so widening the bound to fit it only
  // ever costs the owner.
  const compareLimit = Math.max(MAX_COMPARE_LEN, expected.length + TYPO_SLACK);
  const distance =
    guess.length <= compareLimit ? editDistance(guess, expected) : null;
  // Past that limit the guess differs from the real password by more than
  // TYPO_SLACK edits on length alone, so a null distance now genuinely implies
  // a distance well above MIN_DISTANCE_TO_STORE.
  const storable = distance === null || distance >= MIN_DISTANCE_TO_STORE;

  await db.insert(loginFailures).values({
    ip,
    userAgent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
    passwordLength: guess.length,
    fingerprint: fingerprint(guess),
    distance,
    guess: storable ? guess.slice(0, MAX_STORED_GUESS_LEN) : null,
  });
}

/**
 * Drops entries past the retention window. Called on successful login, which
 * is the one moment the log is known not to be mid-incident.
 */
export async function pruneFailureLog(): Promise<void> {
  await db
    .delete(loginFailures)
    .where(lt(loginFailures.attemptedAt, new Date(Date.now() - RETENTION_MS)));
}
