import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";

/**
 * Liveness for Docker's HEALTHCHECK and docker-compose: 200 once the server
 * is up and the database answers, 503 otherwise.
 *
 * Reachable without a session (let through in proxy.ts), since the probe has
 * no cookie. That's why it says nothing beyond up/down: no version (see
 * api/update for why that stays behind the login) and no error text, which
 * could name the database host.
 */

export const dynamic = "force-dynamic";

/**
 * A database that accepts the connection and then never answers would
 * otherwise hold the probe open until Docker's own timeout, which reports
 * "timed out" rather than "database unreachable" in the server log.
 */
const DB_TIMEOUT_MS = 5_000;

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer within ${DB_TIMEOUT_MS} ms`)),
          DB_TIMEOUT_MS,
        );
      }),
    ]);
    return NextResponse.json({ status: "ok" }, { headers: noStore });
  } catch (error) {
    console.error("[health] Database check failed:", error);
    return NextResponse.json(
      { status: "error" },
      { status: 503, headers: noStore },
    );
  } finally {
    clearTimeout(timer);
  }
}
