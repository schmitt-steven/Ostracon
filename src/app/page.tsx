import { IndexView } from "@/components/index/IndexView";
import { requireAuth } from "@/lib/auth/require-auth";
import { listNotesOverview, toLite } from "@/lib/notes/queries";

/** The default view: every note, most recently edited first. */
export default async function HomePage() {
  await requireAuth();
  const notes = (await listNotesOverview()).map(toLite);

  return <IndexView notes={notes} tag={null} />;
}
