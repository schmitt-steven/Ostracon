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
  // Title is intentionally optional: a very common flow is opening a new
  // note and typing the body first. An empty title is filled in with the
  // note's day (see defaultNoteTitle) rather than blocking the save, so what
  // reaches the column is never blank and every reader — list, backlinks,
  // slug — gets something to name the note by.
  title: z.string().max(300),
  bodyMd: z.string(),
  // Tags arrive as their own field, from the tag bar above the editor. They
  // are deliberately *not* read out of the body: a `#word` in the prose is a
  // reference to a tag, not an act of filing, so a save must be able to carry
  // a tag the body never mentions and to drop one it still does.
  tags: z.array(z.string().max(120)),
});

/**
 * A submitted tag list, cleaned and capped.
 *
 * The cap is a guard on the column, not a rule for the writer: fifty distinct
 * tags on one note is a paste accident, and the array index shouldn't be asked
 * to carry an unbounded list because of one.
 */
function tagsFor(tags: string[]): string[] {
  return normalizeTagList(tags).slice(0, 50);
}

/**
 * The note as it stands, read before an update overwrites it.
 *
 * Two things need it. `createdAt` is the day title's anchor, so a note saved
 * with an empty title keeps landing on the day it was started rather than on
 * today. The rest is the previous state to diff against — see [shellChanged].
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

/** The uploads a note holds, as the rail counts them (see listNotesOverview). */
function uploadSet(contentMd: string): string {
  return [...new Set(referencedUrls(contentMd).filter(isUploadedBlobUrl))]
    .sort()
    .join("\n");
}

/**
 * Whether this save changed anything the surrounding shell is showing.
 *
 * `refresh()` re-runs the whole route tree — layout included — on the client,
 * and it used to fire on every save, which meant a full server render every
 * 800ms of typing. Almost none of those had anything to correct: the rail
 * shows the tag tree and its counts, the titles of pinned notes, and how many
 * uploads the collection holds, and prose moves none of them. So it fires when
 * one of those three actually moved, and body edits pay nothing.
 *
 * It also has to stay this quiet for a second reason. A newly created note
 * swaps its URL under a still-mounted editor (see NoteEditor's onCreated), so
 * for the rest of that session the router's address and its rendered tree
 * belong to different routes — and a refresh would resolve that disagreement
 * by tearing the editor down, which is the exact thing the swap exists to
 * avoid.
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
   * Whether the caller's rendered tree still matches the URL it sits under.
   *
   * False for an editor that created its note and swapped its own URL to it
   * (see NoteEditor's onCreated): from then until the next real navigation the
   * router's address says /notes/[slug] while the mounted tree is still
   * /notes/new's, and `refresh()` would settle that disagreement by throwing
   * the editor away mid-sentence — the exact thing the swap exists to prevent.
   * The save itself is unaffected; only the shell goes without its update, and
   * the `revalidatePath` calls below mean the first navigation away collects it.
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
  // Clearing the title is the same intent as never having typed one, so it
  // lands back on the day title instead of leaving the note nameless. A
  // missing row means the note was deleted mid-edit; the update below is about
  // to no-op on that same absence, so any title will do.
  const finalTitle = title.trim()
    ? title
    : defaultNoteTitle(before?.createdAt ?? new Date());
  const contentMd = stringifyContentMd({ title: finalTitle, tags }, bodyMd);

  // Slug is intentionally never re-derived from title here — fixed at
  // creation so URLs/bookmarks/backlink hrefs survive renames.
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
  // Unconditional, unlike the refresh below: these only mark caches stale, so
  // whatever the user opens next is correct however small the edit was.
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

  // The body is read before the row goes, since it's the only record of which
  // uploads the note was holding.
  const [note] = await db
    .select({ slug: notes.slug, contentMd: notes.contentMd })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1);
  // Already gone — deleting the same note twice (a stale list, a double
  // submit) is a no-op, not an error.
  if (!note) return;

  const affectedSlugs = await linkedSlugs(id);

  // `links` rows at both ends cascade with the note (see schema).
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
  /**
   * The note's slug, or null if the row was gone. The caller needs it to name
   * this note in the rail's pinned order (see [notePinKey]), which lives in the
   * browser — and the buttons that pin address the note by id, not slug.
   */
  slug: string | null;
};

/**
 * Pins a note to the rail, or unpins it.
 *
 * Neither `version` nor `updatedAt` moves. Pinning is not an edit: bumping the
 * version would make the open editor's next autosave collide with a change the
 * same user just made from the same page, and bumping `updatedAt` would push
 * the note to the top of every recency-sorted list for the crime of being
 * marked interesting.
 *
 * The cap is applied in the `where` clause rather than by reading the count
 * first and deciding in JS. Two quick presses dispatch as two actions, and a
 * check-then-write would let both see four pinned notes and both write.
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
        // Already pinned is a no-op, not a re-pin: a note that was second in
        // the section shouldn't jump to the end because the button was pressed
        // twice. It also keeps this note out of its own capacity count.
        isNull(notes.pinnedAt),
        sql`(select count(*) from ${notes} where ${notes.pinnedAt} is not null) < ${MAX_PINNED_NOTES}`,
      ),
    )
    .returning({ slug: notes.slug });

  if (row) {
    revalidatePinned(row.slug, canRefreshShell);
    return { pinned: true, full: false, slug: row.slug };
  }

  // Nothing matched, and the clause can't say which of its three conditions
  // failed — so ask the row. Pinned already means the press was redundant;
  // unpinned means the section is full; gone means the note was deleted
  // elsewhere and there is nothing to report either way.
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

/**
 * The rail is built in the layout, so a pin changes a part of the page the
 * note's own route never rendered — `refresh` is what re-runs the layout for
 * the page the press came from.
 */
function revalidatePinned(slug: string, canRefreshShell: boolean): void {
  revalidatePath("/");
  revalidatePath(`/notes/${slug}`);
  // The button holds its own pressed state, so withholding this costs only the
  // rail's section, and only until the next navigation collects it.
  if (canRefreshShell) refresh();
}

const RenameTagInput = z.object({
  from: z.string().min(1).max(120),
  to: z.string().min(1).max(120),
  /**
   * Restricts the rename to a known set of notes. Only the undo path sets it:
   * renaming `#b` back to `#a` across *everything* would also catch notes that
   * already said `#b` before the rename and had nothing to do with it.
   */
  onlyIds: z.array(z.uuid()).optional(),
});

export type RenameTagResult = {
  /** The notes that actually changed — hand this back as `onlyIds` to undo. */
  noteIds: string[];
};

/**
 * Renames a tag by rewriting every note that carries or mentions it.
 *
 * There is no tag table to update, and that's the point: the notes are the
 * only record of which tags exist, so a rename is a sweep across them and
 * nothing else. Two things move per note, and both have to, or the rename
 * would half-land: the frontmatter record (what the note is filed under) and
 * the `#name` references in the prose (which would otherwise be left pointing
 * at a tag that no longer exists). Children come along — renaming `#infra`
 * moves `#infra/ci` to `#newname/ci` — since the child's name is the parent's
 * with a path appended.
 *
 * Undo is the caller's to offer, and it's exact rather than approximate: the
 * returned ids are the notes this touched, and passing them back as `onlyIds`
 * with the names swapped restores precisely those. That's why no snapshot
 * table is needed for a "one undoable operation" — the operation is its own
 * inverse over a known set.
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
    // A note already carrying the target name collapses two tags into one, so
    // compare the resulting lists rather than counting hits.
    const filedChanged = tags.join("\n") !== current.join("\n");

    // Rewritten back-to-front so each splice leaves the offsets of the ones
    // still to come untouched.
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
 * Every note filed under `target` or anything beneath it, read the way the
 * rename sweep reads them.
 *
 * Descendants come along because they have to, not for symmetry with rename:
 * a tag exists only as far as something is filed under it (see [knownTagSet]),
 * so unfiling `#infra` while `#infra/ci` survives would have `#infra` reappear
 * immediately as that child's ancestor. Deleting the subtree is the only scope
 * in which the tag actually goes away.
 *
 * `parseContentMd` rather than the `tags` column, again as rename does: a note
 * last saved before tags moved into frontmatter has no record there, and
 * [resolveNoteTags] is what reads those the old way — off the prose. Skipping
 * that would let the tag survive its own deletion on exactly those notes.
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
 * What deleting the notes under a tag would actually take with it.
 *
 * Only the destructive half of the dialog asks for this, and it asks the
 * server rather than counting what it was handed, because the count it was
 * handed comes from the tag tree — which knows how many notes are filed under
 * a tag and nothing about what *else* they are filed under.
 *
 * That second number is the one that stops the wrong press. A note tagged
 * `#infra` and `#reading` is as much a reading note as an infra one, and "12
 * notes" says nothing about it; "4 of them are also filed elsewhere" is the
 * difference between clearing out a scratch tag and losing a third of your
 * reading list to it.
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
 * Removes a tag from every note filed under it, leaving the notes alone.
 *
 * Only the frontmatter record moves. A `#name` written in the prose is left
 * exactly as it was, which is deliberate and not an omission: this app already
 * draws a line between the two — "a `#word` in the prose is a reference to a
 * tag, not an act of filing" (see [NoteInput]) — and a reference to a tag that
 * no longer exists is a state it already renders on purpose, as the muted span
 * `remarkHashtag` gives anything it can't resolve. Nothing is left broken, and
 * no sentence is rewritten to say something its author didn't write.
 *
 * It is also what keeps the undo exact and free. Rewriting the prose would
 * mean stripping `#`es that could never be put back — there is no way to tell
 * afterwards which bare "infra"s used to be tags and which were always just
 * the word — so the operation would stop being reversible for the sake of
 * tidiness. As it stands the previous list *is* the whole previous state.
 *
 * The counterpart of rename's sweep, and unlike it this one cannot collide:
 * removing names from a list can't produce a duplicate or overrun the cap, so
 * the result goes to the column as it comes out of the filter.
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
 * Puts each note's tag list back to a list it held before — the undo half of
 * [unfileTag], and nothing else calls it.
 *
 * The whole previous list rather than "add these names back", because the
 * order of a note's tags is load-bearing: the first one is what the note is
 * read under when it was reached from somewhere with no tag of its own, and
 * so what the editor washes the pane in (see [normalizeTagList]). Appending
 * the removed names would put a note tagged `#infra, #ops` back as `#ops,
 * #infra` and quietly recolour it.
 *
 * Which means this overwrites rather than merges, and is only safe because of
 * where it is offered from: a modal that has been open, over these notes,
 * since the moment the list was taken.
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
    // Deleted from elsewhere in the meantime — there is nothing to put a tag
    // back on, and that is not an error worth failing the rest of the undo for.
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
 * Deletes every note filed under a tag, and so the tag with them.
 *
 * The other branch of the same dialog, and the one that doesn't come back:
 * there is no trash in this app, [deleteNote] hard-deletes, and this does the
 * same in bulk. Which is why the dialog makes you type the tag's name and why
 * [tagDeletionStats] is on the screen before the press — see there.
 *
 * Two orderings matter. Backlinks are read first, because `links` rows cascade
 * with the note (see schema) and afterwards there is no way to ask what used
 * to point at it — the surviving notes on the other end need their backlink
 * panes revalidated. The images go last, after the rows are gone, because
 * [deleteNoteImages] keeps any upload another note still references: run per
 * note beforehand and each doomed note's doomed siblings would count as
 * holders, so a picture shared across the batch would be kept forever.
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
