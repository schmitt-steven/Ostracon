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
 * The same allocation as [uniqueSlugFor], decided against a set held in memory
 * rather than against a query per candidate.
 *
 * An import of eight hundred notes asking the database whether each slug is
 * free — and then whether `-2` is free, and `-3` — is thousands of round trips
 * for a question one `select slug from notes` already answers. The caller loads
 * that set once and hands it here; every claim is added to it, so two files
 * called `Setup.md` in the same archive still come out as `setup` and `setup-2`
 * without either of them having been written yet.
 *
 * `preferred` is the slug an archived note asks to keep, so a restore into an
 * empty collection gives back the URLs it was taken from. It is honoured only
 * when it is free and only when it is a slug at all — a file can ask for
 * anything, and `slugify` is what decides what a slug looks like here.
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
