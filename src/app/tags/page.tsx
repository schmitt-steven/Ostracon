import { TagDirectory } from "@/components/tags/TagDirectory";
import { requireAuth } from "@/lib/auth/require-auth";
import { listNotesOverview, toLite } from "@/lib/notes/queries";
import { buildTagTree, flattenTree } from "@/lib/tags/tree";

/**
 * Every tag in the collection.
 *
 * Its own route rather than a panel or a popover, for the same reason /images
 * is one: the rail links to it, and a view the rail can select ought to be a
 * place. It is also where the rail's tag tree went — see [TagDirectory].
 *
 * The tree is built here rather than handed down from the layout's rail data.
 * A page reaching into the shell's props would couple the two, and the build
 * is a pass over a list this route has already loaded.
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
