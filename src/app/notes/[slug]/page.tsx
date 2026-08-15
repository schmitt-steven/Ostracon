import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/editor/NoteEditor";
import { BacklinksPanel } from "@/components/notes/BacklinksPanel";
import { requireAuth } from "@/lib/auth/require-auth";
import { renderNoteHtml } from "@/lib/markdown/render-note";
import { parseContentMd } from "@/lib/notes/frontmatter";
import { getNoteBySlug } from "@/lib/notes/queries";

export default async function NotePage({
  params,
}: PageProps<"/notes/[slug]">) {
  await requireAuth();
  const { slug } = await params;
  const note = await getNoteBySlug(slug);
  if (!note) notFound();

  const { body } = parseContentMd(note.contentMd);
  // Rendered here so the preview pane has content on first paint; the editor
  // re-renders it through the same pipeline as you type.
  const previewHtml = await renderNoteHtml(body);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-8 py-12">
      <NoteEditor
        noteId={note.id}
        version={note.version}
        initialTitle={note.title}
        initialBodyMd={body}
        initialTags={note.tags}
        initialPreviewHtml={previewHtml}
      />
      <BacklinksPanel noteId={note.id} />
    </div>
  );
}
