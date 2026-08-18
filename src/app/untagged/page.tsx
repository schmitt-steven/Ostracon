import { IndexView } from "@/components/index/IndexView";
import { requireAuth } from "@/lib/auth/require-auth";
import { filterNotes, listNotesOverview, toLite } from "@/lib/notes/queries";

/**
 * The notes carrying no hashtag at all.
 *
 * Deliberately a plain list with nothing inviting about it. In a system where
 * tags are the only way of organising anything, this is the new `/misc/` — the
 * folder everything ends up in — so the editor nudges a note out of here
 * rather than this view making it comfortable to stay.
 */
export default async function UntaggedPage() {
  await requireAuth();
  const all = await listNotesOverview();
  const notes = filterNotes(all, null, true).map(toLite);

  return <IndexView notes={notes} tag={null} heading="Untagged" />;
}
