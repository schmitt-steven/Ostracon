import "server-only";
import { listKnownTags } from "@/lib/notes/queries";
import { normalizeTagList, knownTagSet } from "@/lib/tags/parse";
import { extractWikilinkTitles, resolveWikilinkTitles } from "@/lib/notes/wikilinks";
import { renderMarkdown } from "./pipeline";

/**
 * Body markdown → display HTML, with both kinds of reference resolved against
 * what actually exists: wikilinks against the notes table, `#name` hashtags
 * against the tags in use. Shared by the page's first paint and by the
 * live-preview action so the preview can never drift from what a saved note
 * renders as.
 *
 * `draftTags` are the tags of the note being edited, which the tag bar may have
 * grown since the last save. Without them, adding `#idea` in the bar would
 * leave every `#idea` in the prose reading as unresolved until a save landed
 * and something re-rendered — the reference would look broken at exactly the
 * moment it was made.
 */
export async function renderNoteHtml(
  bodyMd: string,
  draftTags: string[] = [],
): Promise<string> {
  const [resolved, known] = await Promise.all([
    resolveWikilinkTitles(extractWikilinkTitles(bodyMd)),
    listKnownTags(),
  ]);
  const draft = knownTagSet([normalizeTagList(draftTags)]);

  return renderMarkdown(bodyMd, {
    resolveWikilink: (title) => resolved.get(title.toLowerCase()),
    isKnownTag: (name) => known.has(name) || draft.has(name),
  });
}
