/**
 * Finding which uploads a note's markdown points at.
 *
 * Nothing records which note an upload belonged to — the URL is written
 * straight into the markdown and that reference is the only link that exists.
 * So ownership (for the gallery) and orphanhood (for cleanup on delete) are
 * both recovered by reading the URLs back out of the note bodies.
 */

/** Matches the prefix the upload route writes under. */
export const UPLOAD_PREFIX = "notes/";

/** Public Vercel Blob URLs are `https://<store>.public.blob.vercel-storage.com/<pathname>`. */
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

// Both syntaxes are covered: the paste handler writes `![alt](url)`, but an
// upload can also end up as a plain link or as raw HTML pasted into the note.
const MARKDOWN_TARGET_RE = /!?\[[^\]]*\]\(\s*<?([^\s)>]+)/g;
const HTML_SRC_RE = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;

// Safe to share these across calls: String.matchAll works on a clone, so it
// never leaves `lastIndex` behind on the module-level regex.
export function referencedUrls(markdown: string): string[] {
  return [MARKDOWN_TARGET_RE, HTML_SRC_RE].flatMap((re) =>
    [...markdown.matchAll(re)]
      .map((m) => m[1])
      .filter((url): url is string => url !== undefined),
  );
}

/**
 * Whether a URL is one of our own uploads — a blob under the prefix the upload
 * route writes to. Note bodies also carry plain external image URLs, and
 * deletion has to keep its hands off those, so this gates the cleanup pass.
 * Mirrors the `remotePatterns` entry in `next.config.ts`.
 */
export function isUploadedBlobUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Relative paths and other non-URLs are never uploads.
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname.endsWith(BLOB_HOST_SUFFIX) &&
    parsed.pathname.startsWith(`/${UPLOAD_PREFIX}`)
  );
}
