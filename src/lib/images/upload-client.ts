"use client";

import { compressImage } from "./compress";

/**
 * One image, from a file to a URL a note can point at. The single path in —
 * paste, drop and pick all come through here, so the shrink can't be skipped.
 */
export async function uploadImage(file: File): Promise<string> {
  return postImage(await compressImage(file));
}

/**
 * The same upload without the shrink. One caller: archive import, replacing
 * images this app already compressed once.
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
