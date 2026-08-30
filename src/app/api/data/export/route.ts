import { archiveFilename, exportArchiveStream } from "@/lib/data/export";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * The whole collection as a download.
 *
 * A GET behind a plain `<a download>` rather than an action that hands back
 * bytes, and that is the entire reason it exists as a route: a link gives the
 * browser's own download — a progress row, a Downloads folder, a resume on a
 * flaky connection — for a response no JavaScript in this app ever has to hold
 * in memory. Cookie auth applies to a link exactly as it does to a fetch, so
 * [requireAuth] is the same gate every other server entry point uses.
 *
 * Not cached, and nothing here asks for it to be: Route Handlers are uncached
 * by default, and [requireAuth] reads cookies, which settles the question
 * twice over.
 *
 * No `Content-Length`. The archive is compressed as it is sent and its size
 * isn't known until it has been, so the browser shows a running byte count
 * instead of a percentage. That is the cost of not buffering a few hundred
 * megabytes in a function, and it is worth it.
 */

/**
 * Copying several hundred megabytes out of the blob store takes longer than a
 * page render is allowed. Five minutes is the ceiling on this project's plan;
 * a deployment on a plan with a lower one will refuse to build until this
 * number comes down, which is the right way to find out.
 */
export const maxDuration = 300;

export async function GET() {
  await requireAuth();

  return new Response(exportArchiveStream(), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archiveFilename()}"`,
      // The archive is a snapshot of a database that changes; a cached copy of
      // one is a backup of the wrong day.
      "Cache-Control": "no-store",
    },
  });
}
