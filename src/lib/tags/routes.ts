/**
 * Where tags live in the URL space. One helper rather than template literals
 * at each call site: a nested tag is several path segments, each of which has
 * to be encoded on its own, and `encodeURIComponent` on the whole name would
 * escape the separating slashes into `%2F`.
 */

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
