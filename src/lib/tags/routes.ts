/**
 * Where tags live in the URL space. One helper rather than template literals
 * at each call site: a nested tag is several path segments, each of which has
 * to be encoded on its own, and `encodeURIComponent` on the whole name would
 * escape the separating slashes into `%2F`.
 */

import { isValidTag, normalizeTag, tagMatches } from "./parse";

export const ALL_NOTES_HREF = "/";
export const UNTAGGED_HREF = "/untagged";

/** `infra/ci` → `/t/infra/ci`. */
export function tagHref(name: string): string {
  return `/t/${name.split("/").map(encodeURIComponent).join("/")}`;
}

/** The inverse, for reading a tag back out of a catch-all route param. */
export function tagFromSegments(segments: string[]): string {
  return segments.map(decodeURIComponent).join("/").toLowerCase();
}

/**
 * Which index a note was opened from, carried in the URL.
 *
 * A note has as many tags as it has, and one of them is not more "its" index
 * than another — so the note's own route cannot work out where you were. It
 * has to be told, and told in the URL rather than in a store, so that the
 * answer survives a reload and a shared link the same way the slug does.
 */
const FROM_PARAM = "from";

/** `/notes/a-note`, remembering the index it was opened from. */
export function noteHref(slug: string, from?: string | null): string {
  const path = `/notes/${encodeURIComponent(slug)}`;
  return from ? `${path}?${FROM_PARAM}=${encodeURIComponent(from)}` : path;
}

/**
 * The tag a note is being read *under*, given the `from` it arrived with and
 * the tags it currently carries.
 *
 * Never trusted as it stands. It comes off the query string, and it can be
 * stale in an honest way too — untag a note in one tab and the other tab's URL
 * still names the index it came from. Anything that doesn't hold up falls back
 * to the note's first tag, which is where every entry point without a context
 * of its own (a bookmark, a backlink, the rail) lands anyway.
 *
 * `tagMatches` rather than `includes` because `/t/infra` lists the notes tagged
 * `#infra/ci` — see [filterNotes]. Coming from a parent is coming from a real
 * index that really did have this note in it.
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
