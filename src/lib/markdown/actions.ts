"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { renderNoteHtml } from "./render-note";

const PreviewInput = z.object({
  bodyMd: z.string(),
  /** The editor's current tag bar — see [renderNoteHtml]. */
  tags: z.array(z.string().max(120)).max(50).default([]),
});

/**
 * Re-renders the body being edited for the live preview. Rendering stays on
 * the server rather than shipping unified + Shiki to the browser, and reuses
 * the exact pipeline saved notes go through.
 */
export async function renderPreview(input: unknown): Promise<string> {
  await requireAuth();
  const { bodyMd, tags } = PreviewInput.parse(input);
  return renderNoteHtml(bodyMd, tags);
}
