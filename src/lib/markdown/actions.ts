"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { renderNoteHtml } from "./render-note";

/**
 * Re-renders the body being edited for the live preview. Rendering stays on
 * the server rather than shipping unified + Shiki to the browser, and reuses
 * the exact pipeline saved notes go through.
 */
export async function renderPreview(bodyMd: unknown): Promise<string> {
  await requireAuth();
  return renderNoteHtml(z.string().parse(bodyMd));
}
