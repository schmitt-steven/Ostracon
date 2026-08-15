import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — comfortably above any screenshot/photo paste

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
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only images are supported" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 413 });
  }

  const pathname = `notes/${Date.now()}-${sanitizeFilename(file.name || "image")}`;
  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type,
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
