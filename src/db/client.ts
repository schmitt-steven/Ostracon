import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One `db`, two drivers, picked by where `DATABASE_URL` points.
 *
 * Neon is reached over HTTP (`neon-http`): one fetch per query, nothing to
 * keep open, which is what a serverless function wants. Any other Postgres —
 * the one in docker-compose, a server of your own — doesn't speak that HTTP
 * protocol, so it gets an ordinary TCP pool (`node-postgres`).
 *
 * Without a URL at all (a `next build` inside Docker, where the database
 * doesn't exist yet) the pool is chosen: it connects lazily, on the first
 * query, so importing this module stays harmless.
 */

type Database = NeonHttpDatabase<typeof schema>;

function isNeonUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

/**
 * The pool outlives a module: `next dev` re-evaluates this file on every
 * edit, and a fresh pool each time would leave the old one's connections
 * open until Postgres runs out of slots.
 */
const globalForPool = globalThis as typeof globalThis & { ostraconPool?: Pool };

function createPool(url: string | undefined): Pool {
  const pool = new Pool({ connectionString: url });
  /**
   * An idle connection that the server closes (Postgres restarting or
   * stopping, a network blip) is reported here. The pool has already
   * dropped it and opens a fresh one on the next query, so logging is all
   * there is to do. Without a listener, Node treats the `error` event as an
   * uncaught exception, which can take the whole server down.
   */
  pool.on("error", (error) => {
    console.error("[db] Idle connection lost:", error.message);
  });
  return pool;
}

function createDb(): Database {
  const url = process.env.DATABASE_URL;

  if (isNeonUrl(url)) {
    return drizzleNeon(neon(url!), { schema });
  }

  const pool = (globalForPool.ostraconPool ??= createPool(url));
  /**
   * Typed as the Neon database on purpose. The query API is the same for
   * both, and `execute` returns `{ rows }` from each, but neon-http has no
   * transactions — so the narrower type is the one that keeps code honest
   * for both deployments.
   */
  return drizzlePg(pool, { schema }) as unknown as Database;
}

export const db = createDb();
