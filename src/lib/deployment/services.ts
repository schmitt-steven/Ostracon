import "server-only";
import { list } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { describeRegion, type Region } from "./regions";

/**
 * The two services this app is nothing without — a Neon database and a Vercel
 * blob store — described twice over: who they are, and how much is in them.
 *
 * The split is not tidiness, it's latency. *Who* is parsed out of the
 * connection string and the token, costs nothing, and can go out with the
 * first byte of the page. *How much* is two network round trips, one of which
 * walks the whole blob store — so the settings page renders without it and
 * lets it arrive on its own (see [DeploymentSection]).
 *
 * **Nothing here may print a credential.** `DATABASE_URL` carries a password
 * and `BLOB_READ_WRITE_TOKEN` is a write key; what leaves this module is only
 * ever the parts of them that are already public — a hostname, a store id that
 * every image URL in the app spells out anyway.
 */

/* ------------------------------------------------------------------ */
/* Who                                                                 */
/* ------------------------------------------------------------------ */

export type DatabaseIdentity = {
  /** `neondb` — the database inside the project, not the project's name. */
  name: string | null;
  /** `ep-cool-name-a1b2c3`, Neon's id for the compute this app talks to. */
  endpoint: string | null;
  /** `eu-central-1`, Frankfurt — or null off Neon. */
  region: Region | null;
  /** Whether we go through Neon's connection pooler rather than the compute directly. */
  pooled: boolean;
  /** The full hostname, which is what to print when this isn't a Neon URL at all. */
  host: string | null;
};

/**
 * Takes a Neon hostname apart.
 *
 * They read
 * `ep-<name>-<id>[-pooler].[c-<n>.]<region>.<cloud>.neon.tech` — the `c-N`
 * label is new and not always there, so the region is found by counting in
 * from the right rather than from the left.
 *
 * The cloud label is parsed past and thrown away. Which of AWS and Azure Neon
 * happens to rent the machine from is Neon's business, not this app's: the
 * thing you would act on is the region, and printing `aws` beside it only
 * raises a question about a provider you never deal with.
 *
 * Anything that doesn't end in `neon.tech` is left alone and reported as a
 * bare host: this app is meant for Neon, but a plain Postgres URL should show
 * what it is rather than be mis-parsed into fields that don't exist.
 */
function readNeonHost(host: string): Omit<DatabaseIdentity, "name"> {
  const bare = { endpoint: null, region: null, pooled: false, host };

  const labels = host.split(".");
  if (labels.slice(-2).join(".") !== "neon.tech") return bare;

  const [endpoint, ...rest] = labels.slice(0, -2);
  if (!endpoint) return bare;

  // The compute-size label carries nothing a reader wants and would otherwise
  // be mistaken for the region.
  const place = rest.filter((label) => !/^c-\d+$/.test(label));

  return {
    endpoint: endpoint.replace(/-pooler$/, ""),
    // Second from the right, the cloud being last.
    region: place.length >= 2 ? describeRegion(place[place.length - 2]!) : null,
    pooled: endpoint.endsWith("-pooler"),
    host,
  };
}

export function describeDatabase(): DatabaseIdentity {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return {
      name: null,
      endpoint: null,
      region: null,
      pooled: false,
      host: null,
    };
  }

  try {
    const parsed = new URL(url);
    return {
      // The leading slash is the URL's, not the database's.
      name: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || null,
      ...readNeonHost(parsed.hostname),
    };
  } catch {
    // A malformed connection string is a real possibility and not this page's
    // business to diagnose — the stats below will fail loudly enough.
    return {
      name: null,
      endpoint: null,
      region: null,
      pooled: false,
      host: null,
    };
  }
}

/**
 * The blob store's id — `store_` plus the sixteen characters that also name
 * the subdomain every uploaded image is served from, so this is public by
 * construction.
 *
 * Read from `BLOB_STORE_ID` where the platform sets it, and otherwise cut out
 * of the read-write token, which spells it as
 * `vercel_blob_rw_<id>_<secret>`. Only the id part is ever returned.
 */
export function describeBlobStore(): string | null {
  const declared = process.env.BLOB_STORE_ID;
  if (declared) return declared;

  const parts = process.env.BLOB_READ_WRITE_TOKEN?.split("_");
  return parts?.length === 5 && parts[3] ? `store_${parts[3]}` : null;
}

/* ------------------------------------------------------------------ */
/* How much                                                            */
/* ------------------------------------------------------------------ */

/**
 * Either the numbers or the reason there aren't any.
 *
 * A settings page that throws because a database is briefly unreachable is a
 * settings page you can't use to find out that the database is unreachable —
 * so both callers below answer with this instead of raising, and the section
 * prints "Unavailable" where the figure would have gone.
 */
export type Stats<T> = { ok: true; value: T } | { ok: false };

export type DatabaseStats = {
  /** Postgres' own version, as it reports it — `17.5`. */
  serverVersion: string;
  /** What the whole database occupies on disk, indexes included. */
  sizeBytes: number;
};

export async function databaseStats(): Promise<Stats<DatabaseStats>> {
  try {
    // One round trip for both facts. Neon charges by connection time as much
    // as anything, and these are two questions about one database.
    const result = await db.execute<{
      server_version: string;
      size_bytes: string;
    }>(sql`
      select
        current_setting('server_version') as server_version,
        pg_database_size(current_database())::text as size_bytes
    `);

    const row = result.rows[0];
    if (!row) return { ok: false };

    return {
      ok: true,
      value: {
        // Postgres appends its build details on some installations; the
        // version is the first word of it.
        serverVersion: row.server_version.split(" ")[0] ?? row.server_version,
        // bigint, cast to text on the way out so it survives the wire intact
        // rather than being handed over as a float that has already rounded.
        sizeBytes: Number(row.size_bytes),
      },
    };
  } catch {
    return { ok: false };
  }
}

export type BlobStats = { count: number; sizeBytes: number };

/**
 * Everything in the store, not just the images the gallery shows.
 *
 * The gallery deliberately hides blobs no note points at, because it is a view
 * of the pictures in the notes. This is a view of the *store* — what is being
 * paid for and what would be lost — so a stray upload counts here even though
 * nothing links to it.
 */
export async function blobStats(): Promise<Stats<BlobStats>> {
  try {
    let count = 0;
    let sizeBytes = 0;
    let cursor: string | undefined;

    do {
      const page = await list({
        cursor,
        // Explicit token for the same reason as the upload route — see the
        // comment there about OIDC resolution.
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      for (const blob of page.blobs) {
        count += 1;
        sizeBytes += blob.size;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return { ok: true, value: { count, sizeBytes } };
  } catch {
    return { ok: false };
  }
}

/* ------------------------------------------------------------------ */

/**
 * Sizes as a person reads them, up to a terabyte.
 *
 * Its own rather than the gallery's: that one stops at MB because a single
 * photograph does, and a database or a whole store does not. One decimal above
 * a kilobyte, none below — "1.4 MB" is a size, "1433.6 KB" is a measurement.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
