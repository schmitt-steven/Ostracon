/**
 * Applies the migrations in `drizzle/` when the Docker container starts.
 *
 * On Vercel, `npm run build` runs `drizzle-kit migrate` before `next build`.
 * A Docker image is built without a database, so the image runs this script
 * on startup instead (before `node server.js`). It uses drizzle-orm's own
 * migrator, so the runtime image needs only `drizzle-orm` and `pg`, not
 * `drizzle-kit`.
 *
 * Both migrators record applied migrations in the same table
 * (`drizzle.__drizzle_migrations`), so a database set up with either one
 * can be upgraded with the other.
 *
 * Environment:
 *   DATABASE_URL      required
 *   MIGRATIONS_DIR    optional, defaults to `../drizzle` next to this file
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** How long to wait for Postgres to accept connections. */
const CONNECT_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 2_000;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set.");
  process.exit(1);
}

const migrationsFolder =
  process.env.MIGRATIONS_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/**
 * compose waits for the db healthcheck, but a database started some other
 * way (or restarting) may still be coming up, so keep trying for a while
 * rather than letting the container crash-loop.
 */
async function connect() {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  for (;;) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => {});
      if (Date.now() >= deadline) throw error;
      console.log(`[migrate] Waiting for the database (${error.message})`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

async function appliedCount(client) {
  const { rows } = await client.query(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  );
  if (!rows[0].exists) return 0;
  const result = await client.query(
    "select count(*)::int as count from drizzle.__drizzle_migrations",
  );
  return result.rows[0].count;
}

let client;
try {
  client = await connect();
  const before = await appliedCount(client);
  await migrate(drizzle(client), { migrationsFolder });
  const after = await appliedCount(client);
  console.log(
    after > before
      ? `[migrate] Applied ${after - before} migration(s).`
      : "[migrate] Database is up to date.",
  );
} catch (error) {
  console.error("[migrate] Migration failed:", error);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
