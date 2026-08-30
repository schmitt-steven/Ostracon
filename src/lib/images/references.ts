/**
 * Which uploads a note's markdown points at. Nothing records upload→note
 * ownership; the URL in the body is the only link, so ownership (gallery) and
 * orphanhood (cleanup) are both recovered by reading URLs back out of bodies.
 */

/** Matches the prefix the upload route writes under. */
export const UPLOAD_PREFIX = "notes/";

/** Public Vercel Blob URLs are `https://<store>.public.blob.vercel-storage.com/<pathname>`. */
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

// Markdown image/link syntax and raw <img> — an upload can end up as any.
const MARKDOWN_TARGET_RE = /!?\[[^\]]*\]\(\s*<?([^\s)>]+)/g;
const HTML_SRC_RE = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;

// Sharing these across calls is safe — matchAll doesn't touch `lastIndex`.
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
