import { NoteEditor } from "@/components/editor/NoteEditor";
import { BackToNotesLink } from "@/components/nav/BackToNotesLink";
import { requireAuth } from "@/lib/auth/require-auth";
import { defaultNoteTitle } from "@/lib/notes/default-title";

export default async function NewNotePage({
  searchParams,
}: PageProps<"/notes/new">) {
  await requireAuth();
  const { title } = await searchParams;
  const initialTitle = typeof title === "string" ? title : "";

  return (
    // pt-16 clears the collapsed CornerNav disc at every viewport width.
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 pt-16">
      <BackToNotesLink />
      <NoteEditor
        noteId={null}
        version={1}
        initialTitle={initialTitle}
        // Today, until the note exists and carries its own creation day.
        defaultTitle={defaultNoteTitle(new Date())}
        // Nothing has been saved yet — the tag appears once the first save
        // lands and the editor redirects to the note's own route.
        recency={null}
        initialBodyMd=""
        initialTags={[]}
      />
    </div>
  );
}
