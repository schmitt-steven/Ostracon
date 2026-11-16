/**
 * Which uploads a note's markdown points at. Nothing records upload→note
 * ownership; the URL in the body is the only link, so ownership (gallery) and
 * orphanhood (cleanup) are both recovered by reading URLs back out of bodies.
 */

/** Matches the prefix the upload route writes under. */
export const UPLOAD_PREFIX = "notes/";

/**
 * Every upload is linked as `/uploads/<pathname>`, wherever it is stored — a
 * folder on disk or a private Vercel Blob store. The route there (app/uploads)
 * checks the session before streaming the bytes, so an image is only ever
 * visible to a signed-in browser. Relative, so links survive the install
 * moving to another domain or another store.
 */
export const UPLOAD_URL_PREFIX = "/uploads/";

/**
 * One path segment as the upload route's sanitiser writes it: no separators,
 * no leading dot, so nothing that could climb out of the store.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

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
 * Whether a pathname is one the upload route could have written:
 * `notes/<safe filename>`, exactly. The single gate between a URL or a route
 * parameter and the store.
 */
export function isUploadPathname(pathname: string): boolean {
  const [directory, name, ...rest] = pathname.split("/");
  return (
    rest.length === 0 &&
    `${directory}/` === UPLOAD_PREFIX &&
    name !== undefined &&
    SAFE_SEGMENT.test(name)
  );
}

/** Where an upload is linked from a note. */
export function uploadUrl(pathname: string): string {
  return `${UPLOAD_URL_PREFIX}${pathname}`;
}

/**
 * The stored pathname behind one of our upload URLs, or null for anything
 * else — note bodies also carry plain external image URLs, and cleanup and
 * export have to keep their hands off those.
 */
export function uploadPathname(url: string): string | null {
  if (!url.startsWith(UPLOAD_URL_PREFIX)) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.slice(UPLOAD_URL_PREFIX.length));
  } catch {
    return null;
  }
  return isUploadPathname(pathname) ? pathname : null;
}

export function isUploadUrl(url: string): boolean {
  return uploadPathname(url) !== null;
}
