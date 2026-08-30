import { archiveFilename, exportArchiveStream } from "@/lib/data/export";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * The whole collection as a download — a GET behind `<a download>`, so the
 * browser owns the download and this app never holds the archive in memory.
 * No `Content-Length` (streamed and compressed as sent).
 */

// Copying the blob store out can take minutes; 300s is this plan's ceiling.
export const maxDuration = 300;

export async function GET() {
  await requireAuth();

  return new Response(exportArchiveStream(), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archiveFilename()}"`,
      // A cached backup is a backup of the wrong day.
      "Cache-Control": "no-store",
    },
  });
}
