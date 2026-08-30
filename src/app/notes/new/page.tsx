import { NoteEditor } from "@/components/editor/NoteEditor";
import { requireAuth } from "@/lib/auth/require-auth";
import { defaultNoteTitle } from "@/lib/notes/default-title";
import { listNotesOverview } from "@/lib/notes/queries";
import { isValidTag, normalizeTag } from "@/lib/tags/parse";
import { buildTagTree, flattenTree } from "@/lib/tags/tree";

export default async function NewNotePage({
  searchParams,
}: PageProps<"/notes/new">) {
  await requireAuth();
  const { title, tag } = await searchParams;
  const initialTitle = typeof title === "string" ? title : "";
  // The palette's "New note tagged #vercel" — validated, not trusted (query string).
  const normalized = typeof tag === "string" ? normalizeTag(tag) : "";
  const initialTags = isValidTag(normalized) ? [normalized] : [];
  const overview = await listNotesOverview();

  return (
    <NoteEditor
      noteId={null}
      version={1}
      initialTitle={initialTitle}
      // Today, until the note exists and carries its own creation day.
      defaultTitle={defaultNoteTitle(new Date())}
      initialBodyMd=""
      initialTags={initialTags}
      // Can't pin a note that doesn't exist yet.
      pinned={false}
      // Nothing saved yet — "edited" reads "just now" until the first save.
      updatedAt={new Date().toISOString()}
      backlinks={[]}
      allTags={flattenTree(
        buildTagTree(
          overview.map((n) => ({
            tags: n.tags,
            updatedAt: n.updatedAt.toISOString(),
          })),
        ),
      ).map((node) => node.name)}
    />
  );
}
