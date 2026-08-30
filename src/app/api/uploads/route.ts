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

// A Route Handler, not a Server Action — Server Actions cap the body at 1MB.
export async function POST(request: Request) {
  await requireAuth();

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  // An exact allowlist, not an `image/` prefix (which would admit SVG). See
  // IMAGE_MIME_TYPES.
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { error: "Only PNG, JPEG, WebP, GIF and AVIF images are supported" },
      { status: 400 },
    );
  }
  // Then the bytes — the label above is forgeable on a hand-built FormData.
  // Only the head is read (SNIFF_BYTES).
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed) {
    return NextResponse.json(
      { error: "That file isn't a PNG, JPEG, WebP, GIF or AVIF image" },
      { status: 400 },
    );
  }
  // Re-checked — the client's compress/refuse (see [compressImage]) isn't a control.
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image too large (max 10MB)" },
      { status: 413 },
    );
  }

  const pathname = `notes/${Date.now()}-${sanitizeFilename(file.name || "image")}`;
  const blob = await put(pathname, file, {
    access: "public",
    // The sniffed type — this is the Content-Type every reader is served under.
    contentType: sniffed,
    // Explicit token, so this doesn't depend on the project's OIDC config —
    // @vercel/blob tries OIDC first when VERCEL_OIDC_TOKEN is present (Next.js
    // injects one for locally-linked projects) and that path fails unless OIDC
    // is enabled for "development" in the dashboard.
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return NextResponse.json({ url: blob.url });
}
