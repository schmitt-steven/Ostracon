import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { getSearchCorpus } from "@/lib/notes/queries";

// The one deliberate Route Handler in the app: a bulk, non-mutating,
// client-initiated GET is exactly the case Server Actions don't fit (POST-
// shaped, dispatched sequentially). Unlike Server Actions and the notes DAL,
// Route Handlers aren't covered by any shared auth convention, and this one
// dumps every note's full body — requireAuth() here is load-bearing, not
// defense in depth.
export async function GET() {
  await requireAuth();
  const notes = await getSearchCorpus();
  return NextResponse.json(notes);
}
