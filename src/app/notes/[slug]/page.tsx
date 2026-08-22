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
  // Which index this was opened from — see [resolveContextTag]. Passed on raw
  // and resolved in the editor, against the tag list as it stands there: the
  // tags are editable on this very screen, and a breadcrumb validated once on
  // the server would go on naming a tag the user has just taken off the note.
  const { from } = await searchParams;
  const note = await getNoteBySlug(slug);
  if (!note) notFound();

  const { data, body } = parseContentMd(note.contentMd);
  const tags = resolveNoteTags(data.tags, body);
  const [previewHtml, backlinks, overview] = await Promise.all([
    // Rendered here so the preview pane has content on first paint; the editor
    // re-renders it through the same pipeline as you type.
    renderNoteHtml(body, tags),
    getBacklinks(note.id),
    // Every tag in the collection, not just this note's: the bar suggests from
    // it and the body's `#` references resolve against it. The whole point is
    // to reuse a tag you already have rather than coin a near-duplicate.
    listNotesOverview(),
  ]);

  return (
    <NoteEditor
      noteId={note.id}
      version={note.version}
      initialTitle={note.title}
      // The note's own day, not today's — emptying the title on an old note
      // restores the day it was started, which is what the save will write.
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
