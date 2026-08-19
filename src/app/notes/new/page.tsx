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
  // The palette's "New note tagged #vercel" — a note started from inside a tag
  // arrives already filed, which is the only reason that row is worth offering
  // over the plain one.
  // Validated rather than trusted: this arrives from the query string, and a
  // tag is created by being written into a note's frontmatter.
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
      // A note that doesn't exist yet can't be pinned; the button only
      // appears once the first save has given it an id.
      pinned={false}
      // Nothing has been saved yet, so "edited" is now — the metadata line
      // reads "just now" until the first save replaces it with a real one.
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
