import "server-only";
import { list } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { describeRegion, type Region } from "./regions";

/**
 * The Neon database and Vercel blob store, described two ways: who they are
 * (parsed from the connection string / token — free, renders immediately) and
 * how much is in them (two round trips — streamed in, see [DeploymentSection]).
 * Nothing here prints a credential; only already-public parts leave the module.
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
 * Takes a Neon hostname apart:
 * `ep-<name>-<id>[-pooler].[c-<n>.]<region>.<cloud>.neon.tech`. The `c-N` label
 * is optional, so the region is counted from the right. The cloud label is
 * dropped. A non-`neon.tech` host is reported as a bare host.
 */
function readNeonHost(host: string): Omit<DatabaseIdentity, "name"> {
  const bare = { endpoint: null, region: null, pooled: false, host };

  const labels = host.split(".");
  if (labels.slice(-2).join(".") !== "neon.tech") return bare;

  const [endpoint, ...rest] = labels.slice(0, -2);
  if (!endpoint) return bare;

  // Drop the compute-size label so it isn't mistaken for the region.
  const place = rest.filter((label) => !/^c-\d+$/.test(label));

  return {
    endpoint: endpoint.replace(/-pooler$/, ""),
    // Second from the right; the cloud is last.
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
    // A malformed connection string isn't this page's job to diagnose.
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
 * The blob store's id — public by construction (it names the image subdomain).
 * From `BLOB_STORE_ID`, or cut out of `vercel_blob_rw_<id>_<secret>`.
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
 * The numbers, or a failure the section prints as "Unavailable" — a stats
 * error shouldn't take down the page that reports it.
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
    // One round trip for both facts — Neon charges by connection time.
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
        // First word — Postgres appends build details on some installs.
        serverVersion: row.server_version.split(" ")[0] ?? row.server_version,
        // Cast to text in SQL so the bigint survives the wire un-rounded.
        sizeBytes: Number(row.size_bytes),
      },
    };
  } catch {
    return { ok: false };
  }
}

export type BlobStats = { count: number; sizeBytes: number };

/**
 * Everything in the store, including blobs no note points at — this is a view
 * of what's being paid for, not of the pictures in the notes.
 */
export async function blobStats(): Promise<Stats<BlobStats>> {
  try {
    let count = 0;
    let sizeBytes = 0;
    let cursor: string | undefined;

    do {
      const page = await list({
        cursor,
        // Explicit token — see the upload route's note on OIDC resolution.
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
 * Sizes as a person reads them, up to a terabyte (the gallery's stops at MB).
 * One decimal above a kilobyte, none below.
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
