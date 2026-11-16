import { getSession } from "@/lib/auth/require-auth";
import { isUploadPathname } from "@/lib/images/references";
import { isAllowedImageType } from "@/lib/images/upload-rules";
import { getStorage } from "@/lib/storage";

/**
 * Every uploaded image, from whichever store this deployment uses — and only
 * to a signed-in browser. The stores themselves aren't reachable from
 * outside (a folder on disk, a private Blob store), so this is the one way in.
 *
 * The proxy already turns a cookieless request away. This checks again
 * because the proxy's check is optimistic (a revoked session still has a
 * well-signed cookie), and answers 401 rather than redirecting, since the
 * asker is an <img>, not a person.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pathname = (await params).path.join("/");
  if (!isUploadPathname(pathname)) return notFound();

  const file = await getStorage().get(pathname);
  if (!file) return notFound();

  // Only the image types the upload route accepts are ever served, under the
  // type the store vouches for — never a type a browser would guess.
  if (!file.contentType || !isAllowedImageType(file.contentType)) {
    await file.stream.cancel();
    return notFound();
  }

  return new Response(file.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "X-Content-Type-Options": "nosniff",
      // A pathname is never written twice (see the upload route), so the
      // bytes behind a URL never change. `private`: it took a session to get,
      // so no shared cache may keep it.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}
