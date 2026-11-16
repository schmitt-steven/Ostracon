import "server-only";
import { del, get, list, put } from "@vercel/blob";
import type { StoredObject, UploadStorage } from "./types";

/**
 * A *private* Vercel Blob store. Access is fixed per store when it is created,
 * so the store has to be made as private (see the README) — writing private
 * blobs to a public store fails.
 *
 * Every call passes the token explicitly, so this doesn't depend on the
 * project's OIDC config — @vercel/blob tries OIDC first when
 * VERCEL_OIDC_TOKEN is present (Next.js injects one for locally-linked
 * projects) and that path fails unless OIDC is enabled for "development" in
 * the dashboard.
 */
function token(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export const vercelBlobStorage: UploadStorage = {
  kind: "vercel-blob",

  async put(pathname, file, contentType) {
    await put(pathname, file, { access: "private", contentType, token: token() });
  },

  async list(prefix) {
    const objects: StoredObject[] = [];
    let cursor: string | undefined;
    // list() pages at 1000; callers want everything, so follow the cursor.
    do {
      const page = await list({ prefix, cursor, token: token() });
      for (const blob of page.blobs) {
        objects.push({
          pathname: blob.pathname,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
        });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return objects;
  },

  async delete(pathnames) {
    if (pathnames.length === 0) return;
    await del(pathnames, { token: token() });
  },

  async get(pathname) {
    const result = await get(pathname, { access: "private", token: token() });
    // 304 only answers a conditional request, which this never makes.
    if (!result || result.statusCode !== 200) return null;
    return {
      stream: result.stream,
      size: result.blob.size,
      contentType: result.blob.contentType,
    };
  },
};
