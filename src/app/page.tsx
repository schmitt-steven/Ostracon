import { IndexView } from "@/components/index/IndexView";
import { requireAuth } from "@/lib/auth/require-auth";
import { listNotesOverview, toLite } from "@/lib/notes/queries";

/**
 * The default view: everything, most recently edited first.
 *
 * This *is* the "recent notes" view, which is why the rail has no section by
 * that name — a list already sorted this way, sitting at the root, would make
 * one redundant.
 */
export default async function HomePage() {
  await requireAuth();
  const notes = (await listNotesOverview()).map(toLite);

  return <IndexView notes={notes} tag={null} />;
}
