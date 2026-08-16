import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/editor/NoteEditor";
import { BackToNotesLink } from "@/components/nav/BackToNotesLink";
import { BacklinksPanel } from "@/components/notes/BacklinksPanel";
import { requireAuth } from "@/lib/auth/require-auth";
import { renderNoteHtml } from "@/lib/markdown/render-note";
import { parseContentMd } from "@/lib/notes/frontmatter";
import { getNoteBySlug } from "@/lib/notes/queries";

export default async function NotePage({
  params,
  searchParams,
}: PageProps<"/notes/[slug]">) {
  await requireAuth();
  const { slug } = await params;
  // Set by the editor when it redirects here right after creating the note —
  // the user is still writing, so don't open in preview.
  const { created } = await searchParams;
  const note = await getNoteBySlug(slug);
  if (!note) notFound();

  const { body } = parseContentMd(note.contentMd);
  // Rendered here so the preview pane has content on first paint; the editor
  // re-renders it through the same pipeline as you type.
  const previewHtml = await renderNoteHtml(body);

  return (
    // pt-16 clears the collapsed CornerNav disc at every viewport width.
    <div className="mx-auto w-full max-w-4xl flex-1 px-8 pb-12 pt-16">
      <BackToNotesLink />
      <NoteEditor
        noteId={note.id}
        version={note.version}
        initialTitle={note.title}
        initialBodyMd={body}
        initialTags={note.tags}
        initialPreviewHtml={previewHtml}
        initialMode={created === "1" ? "write" : undefined}
      />
      <BacklinksPanel noteId={note.id} />
    </div>
  );
}
