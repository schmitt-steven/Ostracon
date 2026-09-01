import { TagDirectory } from "@/components/tags/TagDirectory";
import { requireAuth } from "@/lib/auth/require-auth";
import { listNotesOverview, toLite } from "@/lib/notes/queries";
import { buildTagTree, flattenTree } from "@/lib/tags/tree";

/**
 * Every tag in the collection — where the sidebar's tag tree went (see
 * [TagDirectory]). Its own route (the sidebar links to it). The tree is built
 * here, not shared from the layout, to avoid coupling.
 */
export default async function TagsPage() {
  await requireAuth();
  const notes = (await listNotesOverview()).map(toLite);
  const tree = buildTagTree(notes);

  const tagged = notes.filter((note) => note.tags.length > 0).length;

  return (
    <TagDirectory
      tree={tree}
      tagCount={flattenTree(tree).length}
      taggedCount={tagged}
      untaggedCount={notes.length - tagged}
    />
  );
}
