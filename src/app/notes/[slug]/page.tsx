import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/editor/NoteEditor";
import { requireAuth } from "@/lib/auth/require-auth";
import { renderNoteHtml } from "@/lib/markdown/render-note";
import { defaultNoteTitle } from "@/lib/notes/default-title";
import { parseContentMd } from "@/lib/notes/frontmatter";
import { resolveNoteTags } from "@/lib/tags/parse";
import {
  getBacklinks,
  getNoteBySlug,
  listNotesOverview,
} from "@/lib/notes/queries";
import { buildTagTree, flattenTree } from "@/lib/tags/tree";

export default async function NotePage({
  params,
  searchParams,
}: PageProps<"/notes/[slug]">) {
  await requireAuth();
  const { slug } = await params;
  // Which index this was opened from — passed raw, resolved in the editor
  // (see [resolveContextTag]), since the tags are editable on this screen.
  const { from } = await searchParams;
  const note = await getNoteBySlug(slug);
  if (!note) notFound();

  const { data, body } = parseContentMd(note.contentMd);
  const tags = resolveNoteTags(data.tags, body);
  const [previewHtml, backlinks, overview] = await Promise.all([
    // For the preview pane's first paint.
    renderNoteHtml(body, tags),
    getBacklinks(note.id),
    // Every tag in the collection — the bar suggests from it.
    listNotesOverview(),
  ]);

  return (
    <NoteEditor
      noteId={note.id}
      version={note.version}
      initialTitle={note.title}
      // The note's own day — emptying the title restores the day it was started.
      defaultTitle={defaultNoteTitle(note.createdAt)}
      initialBodyMd={body}
      initialTags={tags}
      openedFrom={typeof from === "string" ? from : undefined}
      initialPreviewHtml={previewHtml}
      pinned={note.pinnedAt !== null}
      updatedAt={note.updatedAt.toISOString()}
      backlinks={backlinks}
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
