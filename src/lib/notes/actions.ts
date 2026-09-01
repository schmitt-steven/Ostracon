"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { notes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/require-auth";
import { deleteNoteImages } from "@/lib/images/cleanup";
import { isUploadedBlobUrl, referencedUrls } from "@/lib/images/references";
import {
  isValidTag,
  normalizeTag,
  normalizeTagList,
  resolveNoteTags,
  scanTags,
  tagMatches,
} from "@/lib/tags/parse";
import { defaultNoteTitle } from "./default-title";
import { parseContentMd, stringifyContentMd } from "./frontmatter";
import { MAX_PINNED_NOTES } from "./pins";
import { uniqueSlugFor } from "./slug";
import { linkedSlugs, syncLinksForNote } from "./wikilinks";

const NoteInput = z.object({
  // Optional — an empty title is filled with the day title (see
  // defaultNoteTitle) rather than blocking the save.
  title: z.string().max(300),
  bodyMd: z.string(),
  // Their own field, from the tag bar — not read out of the body, since a
  // `#word` in prose is a reference, not filing.
  tags: z.array(z.string().max(120)),
});

/** A submitted tag list, cleaned and capped (50 is a paste-accident guard). */
function tagsFor(tags: string[]): string[] {
  return normalizeTagList(tags).slice(0, 50);
}

/**
 * The note before an update overwrites it — `createdAt` anchors the day title,
 * the rest is the previous state for [shellChanged] to diff.
 */
async function currentNote(id: string) {
  const [row] = await db
    .select({
      createdAt: notes.createdAt,
      title: notes.title,
      tags: notes.tags,
      contentMd: notes.contentMd,
    })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1);
  return row;
}

/** The uploads a note holds, as the sidebar counts them (see
 * listNotesOverview). */
function uploadSet(contentMd: string): string {
  return [...new Set(referencedUrls(contentMd).filter(isUploadedBlobUrl))]
    .sort()
    .join("\n");
}

/**
 * Whether this save changed anything the shell shows (pinned titles, tag tree
 * and counts, upload count) — the gate on `refresh()`, so body edits during
 * autosave don't trigger a full route re-render. Staying quiet also protects a
 * URL-swapped editor from being torn down (see NoteEditor's onCreated).
 */
function shellChanged(
  before: { title: string; tags: string[]; contentMd: string } | undefined,
  after: { title: string; tags: string[]; contentMd: string },
): boolean {
  if (!before) return true;
  return (
    before.title !== after.title ||
    before.tags.join("\n") !== after.tags.join("\n") ||
    uploadSet(before.contentMd) !== uploadSet(after.contentMd)
  );
}

export type CreateNoteResult = { id: string; slug: string; version: number };

export async function createNote(input: unknown): Promise<CreateNoteResult> {
  await requireAuth();
  const { title, bodyMd, tags: submitted } = NoteInput.parse(input);
  const tags = tagsFor(submitted);
  const finalTitle = title.trim() ? title : defaultNoteTitle(new Date());
  const slug = await uniqueSlugFor(finalTitle);
  const contentMd = stringifyContentMd({ title: finalTitle, tags }, bodyMd);

  const [row] = await db
    .insert(notes)
    .values({ slug, title: finalTitle, tags, contentMd })
    .returning({ id: notes.id, slug: notes.slug, version: notes.version });
  if (!row) throw new Error("Failed to create note");

  const affectedSlugs = await syncLinksForNote(row.id, bodyMd);
  revalidatePath("/");
  for (const s of affectedSlugs) revalidatePath(`/notes/${s}`);
  return row;
}

const UpdateInput = NoteInput.extend({
  id: z.uuid(),
  expectedVersion: z.number().int(),
  /**
   * False for an editor that swapped its own URL after creating its note (see
   * NoteEditor's onCreated) — `refresh()` would then tear it down mid-sentence.
   * The save is unaffected; the shell update is collected on the next navigation.
   */
  canRefreshShell: z.boolean().default(true),
});

export type UpdateNoteResult =
  | { ok: true; version: number; slug: string }
  | {
      ok: false;
      conflict: true;
      version: number;
      contentMd: string;
      updatedAt: Date;
    }
  | { ok: false; deleted: true };

export async function updateNote(input: unknown): Promise<UpdateNoteResult> {
  await requireAuth();
  const {
    id,
    title,
    bodyMd,
    tags: submitted,
    expectedVersion,
    canRefreshShell,
  } = UpdateInput.parse(input);
  const tags = tagsFor(submitted);
  const before = await currentNote(id);
  // Clearing the title lands back on the day title. A missing row (deleted
  // mid-edit) makes the update below a no-op, so any title will do.
  const finalTitle = title.trim()
    ? title
    : defaultNoteTitle(before?.createdAt ?? new Date());
  const contentMd = stringifyContentMd({ title: finalTitle, tags }, bodyMd);

  // Slug is fixed at creation, never re-derived — URLs survive renames.
  const [updated] = await db
    .update(notes)
    .set({
      title: finalTitle,
      tags,
      contentMd,
      version: sql`${notes.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, id), eq(notes.version, expectedVersion)))
    .returning({ version: notes.version, slug: notes.slug });

  if (!updated) {
    const [current] = await db
      .select({
        version: notes.version,
        contentMd: notes.contentMd,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);
    if (!current) return { ok: false, deleted: true };
    return { ok: false, conflict: true, ...current };
  }

  const affectedSlugs = await syncLinksForNote(id, bodyMd);
  // Unconditional (unlike the refresh below) — only marks caches stale.
  revalidatePath("/");
  revalidatePath(`/notes/${updated.slug}`);
  for (const s of affectedSlugs) revalidatePath(`/notes/${s}`);
  if (
    canRefreshShell &&
    shellChanged(before, { title: finalTitle, tags, contentMd })
  ) {
    refresh();
  }
  return { ok: true, version: updated.version, slug: updated.slug };
}

export async function deleteNote(input: unknown): Promise<void> {
  await requireAuth();
  const id = z.uuid().parse(input);

  // Read before the row goes — the body is the only record of its uploads.
  const [note] = await db
    .select({ slug: notes.slug, contentMd: notes.contentMd })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1);
  // Already gone — a double delete is a no-op.
  if (!note) return;

  const affectedSlugs = await linkedSlugs(id);

  // `links` rows cascade with the note (see schema).
  await db.delete(notes).where(eq(notes.id, id));
  await deleteNoteImages(id, note.contentMd);

  revalidatePath("/");
  revalidatePath(`/notes/${note.slug}`);
  for (const s of affectedSlugs) revalidatePath(`/notes/${s}`);
  refresh();
}

const PinInput = z.object({
  id: z.uuid(),
  pinned: z.boolean(),
  /** As in [UpdateInput] — a swapped-URL editor must not be refreshed out. */
  canRefreshShell: z.boolean().default(true),
});

export type PinNoteResult = {
  /** What the note's state actually is now — the button follows this. */
  pinned: boolean;
  /** The pin was refused because MAX_PINNED_NOTES are already pinned. */
  full: boolean;
  /** The note's slug (null if gone) — the caller names it in the browser-held
   * pinned order (see [notePinKey]). */
  slug: string | null;
};

/**
 * Pins or unpins a note. `version` and `updatedAt` don't move — pinning isn't
 * an edit. The cap is checked in the `where` clause, not read-then-decide, so
 * two quick presses can't both slip past a count of four.
 */
export async function setNotePinned(input: unknown): Promise<PinNoteResult> {
  await requireAuth();
  const { id, pinned, canRefreshShell } = PinInput.parse(input);

  if (!pinned) {
    const [row] = await db
      .update(notes)
      .set({ pinnedAt: null })
      .where(eq(notes.id, id))
      .returning({ slug: notes.slug });
    if (row) revalidatePinned(row.slug, canRefreshShell);
    return { pinned: false, full: false, slug: row?.slug ?? null };
  }

  const [row] = await db
    .update(notes)
    .set({ pinnedAt: new Date() })
    .where(
      and(
        eq(notes.id, id),
        // Already-pinned is a no-op, and stays out of its own capacity count.
        isNull(notes.pinnedAt),
        sql`(select count(*) from ${notes} where ${notes.pinnedAt} is not null) < ${MAX_PINNED_NOTES}`,
      ),
    )
    .returning({ slug: notes.slug });

  if (row) {
    revalidatePinned(row.slug, canRefreshShell);
    return { pinned: true, full: false, slug: row.slug };
  }

  // Nothing matched — ask the row which condition failed: already pinned
  // (redundant), unpinned (section full), or gone.
  const [current] = await db
    .select({ pinnedAt: notes.pinnedAt, slug: notes.slug })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1);
  const alreadyPinned = current?.pinnedAt != null;
  return {
    pinned: alreadyPinned,
    full: current !== undefined && !alreadyPinned,
    slug: current?.slug ?? null,
  };
}

// The sidebar is in the layout, so a pin needs `refresh` to re-run it for the
// page the press came from.
function revalidatePinned(slug: string, canRefreshShell: boolean): void {
  revalidatePath("/");
  revalidatePath(`/notes/${slug}`);
  // The button holds its own state, so withholding this costs only the sidebar
  // section until the next navigation.
  if (canRefreshShell) refresh();
}

const RenameTagInput = z.object({
  from: z.string().min(1).max(120),
  to: z.string().min(1).max(120),
  /** Restricts the rename to a known set of notes — only the undo path sets it. */
  onlyIds: z.array(z.uuid()).optional(),
});

export type RenameTagResult = {
  /** The notes that actually changed — hand this back as `onlyIds` to undo. */
  noteIds: string[];
};

/**
 * Renames a tag by rewriting every note that carries or mentions it — there's
 * no tag table. Both the frontmatter record and the `#name` references in the
 * prose move, and children come along (`#infra` → `#infra/ci` becomes
 * `#newname/ci`). Undo is exact: pass the returned ids back as `onlyIds` with
 * the names swapped.
 */
export async function renameTag(input: unknown): Promise<RenameTagResult> {
  await requireAuth();
  const { from, to, onlyIds } = RenameTagInput.parse(input);
  const source = normalizeTag(from);
  const target = normalizeTag(to);
  if (!isValidTag(source) || !isValidTag(target) || source === target) {
    return { noteIds: [] };
  }

  const rows = await db
    .select({ id: notes.id, slug: notes.slug, contentMd: notes.contentMd })
    .from(notes);

  const scope = onlyIds ? new Set(onlyIds) : null;
  const changed: { id: string; slug: string }[] = [];

  /** `infra/ci` under a rename of `infra` → `newname/ci`. */
  const renamed = (name: string) => `${target}${name.slice(source.length)}`;

  for (const row of rows) {
    if (scope && !scope.has(row.id)) continue;
    const { data, body } = parseContentMd(row.contentMd);

    const current = resolveNoteTags(data.tags, body);
    const tags = tagsFor(
      current.map((tag) => (tagMatches(tag, source) ? renamed(tag) : tag)),
    );
    // Compare the resulting lists — renaming onto an existing tag merges them.
    const filedChanged = tags.join("\n") !== current.join("\n");

    // Back-to-front so each splice leaves later offsets intact.
    const hits = scanTags(body).filter((hit) => tagMatches(hit.name, source));
    let next = body;
    for (let i = hits.length - 1; i >= 0; i--) {
      const hit = hits[i]!;
      next = `${next.slice(0, hit.from)}#${renamed(hit.name)}${next.slice(hit.to)}`;
    }

    if (!filedChanged && hits.length === 0) continue;

    await db
      .update(notes)
      .set({
        contentMd: stringifyContentMd({ title: data.title, tags }, next),
        tags,
        version: sql`${notes.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, row.id));
    changed.push({ id: row.id, slug: row.slug });
  }

  revalidatePath("/");
  for (const note of changed) revalidatePath(`/notes/${note.slug}`);
  refresh();
  return { noteIds: changed.map((note) => note.id) };
}

const TagInput = z.object({ tag: z.string().min(1).max(120) });

/**
 * Every note filed under `target` or beneath it. Descendants are included —
 * a tag exists only as far as something is filed under it (see [tagNameSet]).
 * Reads via `parseContentMd`/[resolveNoteTags], not the `tags` column, so
 * pre-frontmatter notes are caught too.
 */
async function notesUnderTag(target: string) {
  const rows = await db
    .select({ id: notes.id, slug: notes.slug, contentMd: notes.contentMd })
    .from(notes);

  const under: {
    id: string;
    slug: string;
    contentMd: string;
    title: string;
    body: string;
    /** The note's whole tag list as it stands — the undo's restore point. */
    tags: string[];
  }[] = [];

  for (const row of rows) {
    const { data, body } = parseContentMd(row.contentMd);
    const tags = resolveNoteTags(data.tags, body);
    if (!tags.some((tag) => tagMatches(tag, target))) continue;
    under.push({ ...row, title: data.title, body, tags });
  }
  return under;
}

export type TagDeletionStats = {
  /** Notes filed under the tag or anything beneath it. */
  noteCount: number;
  /** How many of those are also filed under a tag from outside the subtree. */
  alsoTagged: number;
};

/**
 * What deleting the notes under a tag would take with it — note count, and how
 * many are also filed elsewhere. The second number is what stops a wrong
 * press, and the tag tree doesn't have it.
 */
export async function tagDeletionStats(
  input: unknown,
): Promise<TagDeletionStats> {
  await requireAuth();
  const target = normalizeTag(TagInput.parse(input).tag);
  if (!isValidTag(target)) return { noteCount: 0, alsoTagged: 0 };

  const under = await notesUnderTag(target);
  return {
    noteCount: under.length,
    alsoTagged: under.filter((note) =>
      note.tags.some((tag) => !tagMatches(tag, target)),
    ).length,
  };
}

export type UnfileTagResult = {
  /**
   * The notes that were filed under the tag, each with the whole list it
   * carried before — hand these back to [restoreNoteTags] to undo.
   */
  unfiled: { id: string; tags: string[] }[];
};

/**
 * Removes a tag from every note filed under it. Only the frontmatter record
 * moves — a `#name` in prose is a reference (see [NoteInput]) and stays as
 * written, rendering as an unresolved span. This also keeps the undo exact:
 * the previous list is the whole previous state.
 */
export async function unfileTag(input: unknown): Promise<UnfileTagResult> {
  await requireAuth();
  const target = normalizeTag(TagInput.parse(input).tag);
  if (!isValidTag(target)) return { unfiled: [] };

  const under = await notesUnderTag(target);
  for (const note of under) {
    const tags = note.tags.filter((tag) => !tagMatches(tag, target));
    await db
      .update(notes)
      .set({
        contentMd: stringifyContentMd({ title: note.title, tags }, note.body),
        tags,
        version: sql`${notes.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, note.id));
  }

  revalidatePath("/");
  for (const note of under) revalidatePath(`/notes/${note.slug}`);
  refresh();
  return { unfiled: under.map((note) => ({ id: note.id, tags: note.tags })) };
}

const RestoreTagsInput = z.object({
  entries: z
    .array(
      z.object({ id: z.uuid(), tags: z.array(z.string().max(120)).max(50) }),
    )
    .max(2000),
});

/**
 * Puts each note's tag list back to one it held before — the undo half of
 * [unfileTag]. Overwrites with the whole previous list, because tag order is
 * load-bearing (see [normalizeTagList]); safe only because it's offered from a
 * modal open over these notes since the list was taken.
 */
export async function restoreNoteTags(input: unknown): Promise<void> {
  await requireAuth();
  const { entries } = RestoreTagsInput.parse(input);

  for (const entry of entries) {
    const [row] = await db
      .select({ slug: notes.slug, contentMd: notes.contentMd })
      .from(notes)
      .where(eq(notes.id, entry.id))
      .limit(1);
    // Deleted meanwhile — skip, don't fail the rest of the undo.
    if (!row) continue;

    const { data, body } = parseContentMd(row.contentMd);
    const tags = tagsFor(entry.tags);
    await db
      .update(notes)
      .set({
        contentMd: stringifyContentMd({ title: data.title, tags }, body),
        tags,
        version: sql`${notes.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, entry.id));
    revalidatePath(`/notes/${row.slug}`);
  }

  revalidatePath("/");
  refresh();
}

/**
 * Hard-deletes every note filed under a tag (no trash — see [tagDeletionStats]
 * and the type-the-name dialog). Ordering matters twice: backlinks are read
 * before the delete (the `links` rows cascade), and images after it (so a
 * doomed sibling isn't counted as a holder of a shared upload).
 */
export async function deleteTaggedNotes(
  input: unknown,
): Promise<{ count: number }> {
  await requireAuth();
  const target = normalizeTag(TagInput.parse(input).tag);
  if (!isValidTag(target)) return { count: 0 };

  const doomed = await notesUnderTag(target);
  if (doomed.length === 0) return { count: 0 };

  const affected = new Set<string>();
  for (const note of doomed) {
    for (const slug of await linkedSlugs(note.id)) affected.add(slug);
  }

  await db.delete(notes).where(
    inArray(
      notes.id,
      doomed.map((note) => note.id),
    ),
  );
  for (const note of doomed) await deleteNoteImages(note.id, note.contentMd);

  revalidatePath("/");
  for (const note of doomed) {
    affected.delete(note.slug);
    revalidatePath(`/notes/${note.slug}`);
  }
  for (const slug of affected) revalidatePath(`/notes/${slug}`);
  refresh();
  return { count: doomed.length };
}
