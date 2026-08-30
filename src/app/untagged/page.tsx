import { IndexView } from "@/components/index/IndexView";
import { requireAuth } from "@/lib/auth/require-auth";
import { filterNotes, listNotesOverview, toLite } from "@/lib/notes/queries";

/**
 * The notes carrying no tag — deliberately a plain list. It's the new
 * `/misc/`, so the editor nudges notes out of here rather than this view
 * making it comfortable to stay.
 */
export default async function UntaggedPage() {
  await requireAuth();
  const all = await listNotesOverview();
  const notes = filterNotes(all, null, true).map(toLite);

  return <IndexView notes={notes} tag={null} heading="Untagged" />;
}
