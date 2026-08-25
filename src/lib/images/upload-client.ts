"use client";

import { compressImage } from "./compress";

/**
 * One image, from a file on someone's machine to a URL a note can point at.
 *
 * The single path in: pasting, dropping and picking all come through here, so
 * the shrink happens once for all three and none of them can quietly skip it.
 */
export async function uploadImage(file: File): Promise<string> {
  const prepared = await compressImage(file);
  const formData = new FormData();
  formData.append("file", prepared);

  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Upload failed");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
