import "server-only";
import { listTagNames } from "@/lib/notes/queries";
import { normalizeTagList, tagNameSet } from "@/lib/tags/parse";
import {
  extractWikilinkTitles,
  resolveWikilinkTitles,
} from "@/lib/notes/wikilinks";
import { renderMarkdown } from "./pipeline";

/**
 * Body markdown → display HTML, with wikilinks resolved against the notes
 * table and `#name` hashtags against the tags in use. Shared by first paint
 * and the live-preview action so they can't drift.
 *
 * `draftTags` are the editing note's current tag bar, so a `#idea` just added
 * there resolves immediately rather than reading as broken until a save.
 */
export async function renderNoteHtml(
  bodyMd: string,
  draftTags: string[] = [],
): Promise<string> {
  const [resolved, known] = await Promise.all([
    resolveWikilinkTitles(extractWikilinkTitles(bodyMd)),
    listTagNames(),
  ]);
  const draft = tagNameSet([normalizeTagList(draftTags)]);

  return renderMarkdown(bodyMd, {
    resolveWikilink: (title) => resolved.get(title.toLowerCase()),
    isKnownTag: (name) => known.has(name) || draft.has(name),
  });
}
