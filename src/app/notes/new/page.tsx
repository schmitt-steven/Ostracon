import { NoteEditor } from "@/components/editor/NoteEditor";
import { requireAuth } from "@/lib/auth/require-auth";
import { defaultNoteTitle } from "@/lib/notes/default-title";
import { listNotesOverview } from "@/lib/notes/queries";
import { isValidTag, normalizeTag } from "@/lib/tags/parse";
import { buildTagTree, flattenTree } from "@/lib/tags/tree";

/** A shared title is a heading, not an essay; the rest would be a body. */
const MAX_SHARED_TITLE = 200;
/** Room for a long quoted passage, well under the import cap. */
const MAX_SHARED_TEXT = 8_000;

/** One shared param, if it is a string and not an unreasonable one. */
function shared(value: string | string[] | undefined, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

export default async function NewNotePage({
  searchParams,
}: PageProps<"/notes/new">) {
  await requireAuth();
  const { title, tag, text, url } = await searchParams;
  const initialTitle = shared(title, MAX_SHARED_TITLE);
  // The palette's "New note tagged #vercel" — validated, not trusted (query string).
  const normalized = typeof tag === "string" ? normalizeTag(tag) : "";
  const initialTags = isValidTag(normalized) ? [normalized] : [];
  // The OS share sheet's half of the manifest's share_target: a link, a
  // selection, or both. Trimmed and length-capped like every other query
  // string here — the markdown itself is sanitised where it is rendered.
  const initialBodyMd = [shared(url, MAX_SHARED_TITLE), shared(text, MAX_SHARED_TEXT)]
    .filter(Boolean)
    .join("\n\n");
  const overview = await listNotesOverview();

  return (
    <NoteEditor
      noteId={null}
      version={1}
      initialTitle={initialTitle}
      // Today, until the note exists and carries its own creation day.
      defaultTitle={defaultNoteTitle(new Date())}
      initialBodyMd={initialBodyMd}
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
