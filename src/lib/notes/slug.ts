import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notes } from "@/db/schema";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function slugExists(candidate: string): Promise<boolean> {
  const existing = await db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.slug, candidate))
    .limit(1);
  return existing.length > 0;
}

export async function uniqueSlugFor(title: string): Promise<string> {
  const base = slugify(title);

  if (base.length === 0) {
    // No usable title text (empty or e.g. all punctuation) — use a short
    // random slug rather than a shared "note"/"untitled" base, which would
    // otherwise pile up as meaningless "note-2", "note-15", ... counters.
    for (;;) {
      const candidate = `untitled-${randomBytes(4).toString("hex")}`;
      if (!(await slugExists(candidate))) return candidate;
    }
  }

  let candidate = base;
  let suffix = 2;
  while (await slugExists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
