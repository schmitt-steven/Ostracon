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
 * The one password this app has. It lives in one of two places, and this file
 * arbitrates which is in force:
 *
 *   - APP_PASSWORD in the environment, compared verbatim — how every
 *     deployment starts, and unchangeable from inside the app.
 *   - A scrypt hash in [appPassword], written the first time the owner changes
 *     their password. Once present it's the only thing consulted.
 *
 * A hash and not the plaintext because DATABASE_URL is far more widely exposed
 * than APP_PASSWORD. All reads go through [loadCredential] so a login is one
 * query.
 */

// The singleton row's key. Nothing reads it but this file.
const ROW_ID = "current";

/**
 * scrypt parameters for interactive logins (~16MB, a few hundred ms). Written
 * into every hash, so raising them later still leaves old rows verifiable.
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
    // Derived from the parameters so a raise can't hit Node's 32MB default.
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
 * Whether `password` produces `stored`, at the parameters `stored` records. A
 * hash this can't parse fails closed rather than throwing.
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
 * The environment's password, compared through equal-length SHA-256 digests so
 * timing doesn't leak a matched prefix. (Unset APP_PASSWORD is handled in
 * [loadCredential] as "missing", not here.)
 */
function matchesEnvPassword(submitted: string, expected: string): boolean {
  const a = createHash("sha256").update(submitted).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Which password is in force, read once per login. Server-only — never crosses
 * the wire. `env` carries the plaintext; `stored` carries only the hash.
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

/** Replaces the password with `password`, hashed, stamping `changedAt`. */
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
 * When the password was last set from inside the app, or null if it's still
 * the deployment's APP_PASSWORD.
 */
export async function passwordChangedAt(): Promise<Date | null> {
  const credential = await loadCredential();
  return credential.kind === "stored" ? credential.changedAt : null;
}
