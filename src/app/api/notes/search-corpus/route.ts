import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { getSearchCorpus } from "@/lib/notes/queries";

// A Route Handler because it's a bulk client-initiated GET, which Server
// Actions don't fit. It ships every note's full body, so requireAuth() here is
// load-bearing.
export async function GET() {
  await requireAuth();
  const notes = await getSearchCorpus();
  return NextResponse.json(notes);
}
