import "server-only";
import { extractWikilinkTitles, resolveWikilinkTitles } from "@/lib/notes/wikilinks";
import { renderMarkdown } from "./pipeline";

/**
 * Body markdown → display HTML, wikilinks resolved against the notes table.
 * Shared by the page's first paint and by the live-preview action so the
 * preview can never drift from what a saved note renders as.
 */
export async function renderNoteHtml(bodyMd: string): Promise<string> {
  const resolved = await resolveWikilinkTitles(extractWikilinkTitles(bodyMd));
  return renderMarkdown(bodyMd, (title) => resolved.get(title.toLowerCase()));
}
