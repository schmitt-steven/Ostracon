/**
 * Where tags live in the URL space. Helpers, not inline template literals — a
 * nested tag's slashes must survive encoding, so each segment is encoded alone.
 */

import { isValidTag, normalizeTag, tagMatches } from "./parse";

export const ALL_NOTES_HREF = "/";
export const UNTAGGED_HREF = "/untagged";
/** The tag directory — every tag at once, which the sidebar no longer lists. */
export const TAGS_HREF = "/tags";

/** `infra/ci` → `/t/infra/ci`. */
export function tagHref(name: string): string {
  return `/t/${name.split("/").map(encodeURIComponent).join("/")}`;
}

/** The inverse, for reading a tag back out of a catch-all route param. */
export function tagFromSegments(segments: string[]): string {
  return segments.map(decodeURIComponent).join("/").toLowerCase();
}

// Which index a note was opened from — in the URL, not a store, so it survives
// a reload and a shared link.
const FROM_PARAM = "from";

/** `/notes/a-note`, remembering the index it was opened from. */
export function noteHref(slug: string, from?: string | null): string {
  const path = `/notes/${encodeURIComponent(slug)}`;
  return from ? `${path}?${FROM_PARAM}=${encodeURIComponent(from)}` : path;
}

/**
 * The tag a note is read *under*, from the `from` param and the note's current
 * tags. Untrusted and possibly stale — anything that doesn't hold up falls
 * back to the first tag. `tagMatches`, not `includes`, so a parent index
 * counts (see [filterNotes]).
 */
export function resolveContextTag(
  from: string | undefined,
  tags: string[],
): string | null {
  const fallback = tags[0] ?? null;
  if (from === undefined) return fallback;
  const name = normalizeTag(from);
  if (!isValidTag(name)) return fallback;
  return tags.some((tag) => tagMatches(tag, name)) ? name : fallback;
}
