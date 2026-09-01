import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { describeRelease } from "@/lib/deployment/release";
import { checkForUpdate } from "@/lib/deployment/update";

/**
 * Whether a newer Ostracon exists — asked by the sidebar's update row.
 *
 * A Route Handler rather than something the layout awaits: the check is a
 * request to GitHub, and every page in the app renders through that layout. A
 * slow or unreachable GitHub would delay the whole shell for news that is
 * almost never there. This way the shell paints first and the row appears
 * behind it, or never.
 *
 * Behind requireAuth() because it says which version is deployed, and a
 * version is a shape a stranger could match against known holes.
 */
export async function GET() {
  await requireAuth();
  const update = await checkForUpdate(describeRelease().version);
  return NextResponse.json(update);
}
