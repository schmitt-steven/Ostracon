import { NoteEditor } from "@/components/editor/NoteEditor";
import { requireAuth } from "@/lib/auth/require-auth";

export default async function NewNotePage({
  searchParams,
}: PageProps<"/notes/new">) {
  await requireAuth();
  const { title } = await searchParams;
  const initialTitle = typeof title === "string" ? title : "";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6">
      <NoteEditor
        noteId={null}
        version={1}
        initialTitle={initialTitle}
        initialBodyMd=""
        initialTags={[]}
      />
    </div>
  );
}
