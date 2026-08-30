import "server-only";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appPassword } from "@/db/schema";

/**
 * The one password this app has, wherever it currently lives.
 *
 * There are two places it can be, and which one is in force is the whole of
 * what this file arbitrates:
 *
 *   - **The environment.** APP_PASSWORD, compared verbatim, which is how every
 *     deployment starts. It is a variable set by hand on the platform, so it
 *     cannot be changed from inside the app — which is exactly why it can't be
 *     the only answer.
 *   - **The database.** A scrypt hash in [appPassword], written the first time
 *     the owner changes their password from settings. From then on it is the
 *     only thing consulted, and APP_PASSWORD is dead weight the deployment can
 *     drop.
 *
 * A hash rather than the plaintext, even though the environment holds the
 * plaintext today, because the two are not equally exposed: DATABASE_URL is
 * held by the build, by drizzle-kit, by the Neon console and by every backup,
 * and a shared password is exactly the kind of string that also unlocks
 * something else.
 *
 * Everything is read through [loadCredential] rather than looked up per call,
 * so a login costs one query no matter how many questions are asked of it.
 */

// The singleton row's key. Nothing reads it but this file.
const ROW_ID = "current";

/**
 * scrypt at the parameters recommended for interactive logins: ~16MB of memory
 * and a few hundred milliseconds per derivation, which is unnoticeable once per
 * sign-in and ruinous a few billion times over.
 *
 * Written into every hash, so raising them later leaves existing rows
 * verifiable at the values they were made with — a password that could only be
 * checked by the parameters currently in fashion would lock its owner out on
 * the deploy that changed them.
 */
const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;
const SALT_BYTES = 16;

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; keyLength: number },
): Promise<Buffer> {
  return scrypt(password, salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    // Node's default ceiling is 32MB, which N=16384/r=8 sits just under and any
    // raise would breach — stated in terms of the parameters so the two can't
    // drift apart into a runtime error on a deploy.
    maxmem: Math.max(32 * 1024 * 1024, 256 * params.N * params.r),
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("hex"),
    key.toString("hex"),
  ].join("$");
}

/**
 * Whether `password` produces `stored`, at whatever parameters `stored` was
 * made with. A hash this doesn't understand fails closed rather than throwing:
 * the caller is a login, and an unreadable row is a wrong password as far as
 * the door is concerned.
 */
async function matchesHash(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [scheme, n, r, p, salt, key] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (scheme !== "scrypt") return false;

  const params = {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    keyLength: key.length / 2,
  };
  if (
    !Number.isInteger(params.N) ||
    !Number.isInteger(params.r) ||
    !Number.isInteger(params.p) ||
    !Number.isInteger(params.keyLength) ||
    params.keyLength === 0
  ) {
    return false;
  }

  const expected = Buffer.from(key, "hex");
  if (expected.length !== params.keyLength) return false;

  const actual = await derive(password, Buffer.from(salt, "hex"), params);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * The environment's password, compared through equal-length digests so the
 * comparison doesn't leak the prefix a guess got right. Unset APP_PASSWORD is
 * not "everything matches" — it is a deployment nobody can sign in to, which is
 * the safe way for that mistake to show up.
 */
function matchesEnvPassword(submitted: string, expected: string): boolean {
  const a = createHash("sha256").update(submitted).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Which password is in force, read once and passed to everything that needs an
 * answer about it.
 *
 * `env` carries the plaintext because at that point the plaintext is what the
 * password *is*; `stored` deliberately cannot. Server-only, and never returned
 * to a caller across the wire.
 */
export type Credential =
  | { kind: "stored"; hash: string; changedAt: Date }
  | { kind: "env"; password: string }
  | { kind: "missing" };

export async function loadCredential(): Promise<Credential> {
  const [row] = await db
    .select({ hash: appPassword.hash, changedAt: appPassword.changedAt })
    .from(appPassword)
    .where(eq(appPassword.id, ROW_ID))
    .limit(1);

  if (row) return { kind: "stored", hash: row.hash, changedAt: row.changedAt };

  const fromEnv = process.env.APP_PASSWORD;
  return fromEnv ? { kind: "env", password: fromEnv } : { kind: "missing" };
}

export async function verifyPassword(
  submitted: string,
  credential: Credential,
): Promise<boolean> {
  switch (credential.kind) {
    case "stored":
      return matchesHash(submitted, credential.hash);
    case "env":
      return matchesEnvPassword(submitted, credential.password);
    case "missing":
      return false;
  }
}

/**
 * Replaces the password with `password`, hashed. Idempotent in shape rather
 * than in effect: every call rewrites the row, and `changedAt` is what the
 * settings page reports.
 */
export async function setPassword(password: string): Promise<void> {
  const hash = await hashPassword(password);
  const changedAt = new Date();
  await db
    .insert(appPassword)
    .values({ id: ROW_ID, hash, changedAt })
    .onConflictDoUpdate({
      target: appPassword.id,
      set: { hash, changedAt },
    });
}

/**
 * When the password was last set from inside the app, or null if it never has
 * been — the deployment is still running on APP_PASSWORD.
 *
 * Null does not distinguish "still the original" from "APP_PASSWORD is unset
 * and nobody can sign in at all", because the page that shows it is behind a
 * sign-in: reaching it proves the second case isn't the one you're in.
 */
export async function passwordChangedAt(): Promise<Date | null> {
  const credential = await loadCredential();
  return credential.kind === "stored" ? credential.changedAt : null;
}
