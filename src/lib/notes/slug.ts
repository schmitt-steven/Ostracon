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

/**
 * Like [uniqueSlugFor], but allocated against an in-memory set (from
 * [takenSlugs]) rather than a query per candidate — for bulk imports. Each
 * claim is added to the set, so unwritten notes still get distinct slugs.
 *
 * `preferred` is a slug an archived note asks to keep; honoured only when free
 * and only after `slugify`.
 */
export function claimSlug(
  taken: Set<string>,
  title: string,
  preferred?: string | null,
): string {
  const wanted = preferred ? slugify(preferred) : "";
  if (wanted && !taken.has(wanted)) {
    taken.add(wanted);
    return wanted;
  }

  const base = slugify(title);
  if (base.length === 0) {
    for (;;) {
      const candidate = `untitled-${randomBytes(4).toString("hex")}`;
      if (taken.has(candidate)) continue;
      taken.add(candidate);
      return candidate;
    }
  }

  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}

/** Every slug in use, for [claimSlug] to allocate against. */
export async function takenSlugs(): Promise<Set<string>> {
  const rows = await db.select({ slug: notes.slug }).from(notes);
  return new Set(rows.map((row) => row.slug));
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
    // No usable title text — a short random slug rather than a shared
    // "untitled" base that would pile up as "untitled-2", "untitled-15", ...
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
