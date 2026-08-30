"use client";

import { compressImage } from "./compress";

/**
 * One image, from a file on someone's machine to a URL a note can point at.
 *
 * The single path in: pasting, dropping and picking all come through here, so
 * the shrink happens once for all three and none of them can quietly skip it.
 */
export async function uploadImage(file: File): Promise<string> {
  return postImage(await compressImage(file));
}

/**
 * The same upload with the shrink skipped.
 *
 * One caller, and it has earned the exception: an archive import is putting
 * back images that went through [compressImage] the first time they were
 * uploaded. Re-encoding a WebP that this app itself produced cannot make it
 * smaller — [compressImage] would keep the original anyway — so all the second
 * pass would buy is a decode and an encode per image, several hundred times
 * over, on the one path where there are several hundred.
 */
export async function postImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

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
