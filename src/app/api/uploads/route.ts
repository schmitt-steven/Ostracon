import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { SNIFF_BYTES, sniffImageType } from "@/lib/images/sniff";
import {
  isAllowedImageType,
  MAX_IMAGE_BYTES,
} from "@/lib/images/upload-rules";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
}

// Binary upload, not a Server Action: Server Actions default to a 1MB body
// cap and aren't the right shape for file bytes.
export async function POST(request: Request) {
  await requireAuth();

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  // An allowlist, not an `image/` prefix: that prefix let `image/svg+xml`
  // through, and an SVG is a document that can carry script. See the note on
  // IMAGE_MIME_TYPES.
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { error: "Only PNG, JPEG, WebP, GIF and AVIF images are supported" },
      { status: 400 },
    );
  }
  // And then the bytes, because the line above only checked a *label*. On a
  // file the user picked, the browser sniffed that label and it is honest; on a
  // hand-built FormData it says whatever the sender wants, and this is a POST
  // endpoint anyone signed in can reach. The label still gets checked first so
  // an ordinary mistake is refused by name rather than as "not an image".
  //
  // Only the head is read — see SNIFF_BYTES — so a ten-megabyte upload is not
  // pulled into memory to look at eight of them.
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed) {
    return NextResponse.json(
      { error: "That file isn't a PNG, JPEG, WebP, GIF or AVIF image" },
      { status: 400 },
    );
  }
  // Re-checked here rather than trusted from the browser: the client shrinks
  // most images to a fraction of this before sending (see [compressImage]) and
  // refuses the rest, but neither of those is a control — this endpoint takes
  // whatever it is posted.
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image too large (max 10MB)" },
      { status: 413 },
    );
  }

  const pathname = `notes/${Date.now()}-${sanitizeFilename(file.name || "image")}`;
  const blob = await put(pathname, file, {
    access: "public",
    // What the bytes are, not what the request said they were. This is the
    // Content-Type every reader will be served the image under, so it is the
    // one place where guessing from a label would actually have consequences.
    contentType: sniffed,
    // Explicit, so this always resolves the same way regardless of the
    // linked Vercel project's OIDC configuration: @vercel/blob tries OIDC
    // first when a VERCEL_OIDC_TOKEN is present (Next.js injects one
    // automatically for locally-linked projects), and that path fails
    // unless OIDC is specifically enabled for the "development" environment
    // in the Vercel dashboard. Passing the token directly skips that
    // resolution entirely and always uses the static token.
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return NextResponse.json({ url: blob.url });
}
