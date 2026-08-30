import { IndexView } from "@/components/index/IndexView";
import { requireAuth } from "@/lib/auth/require-auth";
import { filterNotes, listNotesOverview, toLite } from "@/lib/notes/queries";
import { tagFromSegments } from "@/lib/tags/routes";

/**
 * One tag's notes. A catch-all segment because tags nest — `/t/infra/ci` is
 * one tag with a slash in it. A parent shows its children's notes too.
 */
export default async function TagPage(props: PageProps<"/t/[...tag]">) {
  await requireAuth();
  const { tag: segments } = await props.params;
  const tag = tagFromSegments(segments);

  const all = await listNotesOverview();
  const notes = filterNotes(all, tag).map(toLite);

  return <IndexView notes={notes} tag={tag} />;
}
