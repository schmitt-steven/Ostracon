"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  deleteTaggedNotes,
  restoreNoteTags,
  tagDeletionStats,
  unfileTag,
  type TagDeletionStats,
} from "@/lib/notes/actions";
import { tagRoot } from "@/lib/tags/hue";
import { normalizeTag, tagMatches } from "@/lib/tags/parse";
import {
  getTagPreferences,
  setTagHue,
  togglePinned,
} from "@/lib/tags/preferences";
import { ALL_NOTES_HREF, tagHref } from "@/lib/tags/routes";

type Props = {
  tag: string;
  /**
   * Notes under this tag or anything beneath it — as [TagRenameDialog], and
   * counted by whoever opened this for the same reason. The destructive branch
   * asks the server for its own number (see [tagDeletionStats]); this one is
   * what the first screen can say without waiting.
   */
  noteCount: number;
  onClose: () => void;
};

/**
 * What was cleared out of the browser's tag preferences on the user's behalf,
 * kept so the undo can put it back.
 *
 * These live in localStorage rather than the database, so no server action can
 * reach them — a tag deleted without this leaves its name pinned, where the
 * rail drops the row (it can't find the tag in the tree) but the stored name
 * goes on counting against MAX_PINNED_TAGS forever.
 */
type ClearedPreferences = {
  /** Pinned names that were under the tag, including the tag itself. */
  pinned: string[];
  /** The hue override that was removed, if there was one. */
  hue: number | null;
};

function clearPreferences(tag: string): ClearedPreferences {
  const before = getTagPreferences();
  const pinned = before.pinned.filter((name) => tagMatches(name, tag));
  for (const name of pinned) togglePinned(name);

  // Only when the tag *is* a root. Hues are stored per root segment because
  // children inherit them (see [setTagHue]), so deleting `#infra/ci` must
  // leave `#infra`'s colour alone — and deleting `#infra` takes every
  // descendant with it, so nothing is left to wear it.
  const root = tagRoot(tag);
  const hue = root === tag ? (before.hues[root] ?? null) : null;
  if (hue !== null) setTagHue(tag, null);

  return { pinned, hue };
}

function restorePreferences(tag: string, cleared: ClearedPreferences): void {
  // Back to front: each pin prepends its name, so replaying the list in order
  // would hand it back reversed.
  for (const name of [...cleared.pinned].reverse()) togglePinned(name);
  if (cleared.hue !== null) setTagHue(tag, cleared.hue);
}

/**
 * Deleting a tag, both meanings of it.
 *
 * The tag exists nowhere but on the notes — the same fact rename is built on —
 * so there is no row to delete and the question is only ever what happens to
 * the notes carrying it. Two answers, and they are not variations on each
 * other: one unfiles and can be taken back in full, the other deletes the
 * notes and cannot be taken back at all. The dialog is shaped around that
 * asymmetry rather than presenting them as a pair of equal options — the safe
 * one acts on its press, the destructive one only opens a second screen that
 * makes you type the name.
 *
 * Nested tags come along in both. Not for tidiness: a tag exists exactly as
 * far as something is filed under it, so leaving `#infra/ci` behind would have
 * `#infra` reappear in the tree the moment the dialog closed, and the delete
 * would look like it had done nothing.
 */
export function TagDeleteDialog({ tag, noteCount, onClose }: Props) {
  const [view, setView] = useState<"choose" | "confirm">("choose");
  const [stats, setStats] = useState<TagDeletionStats | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** What happened, once something has — the screen after the press. */
  const [done, setDone] = useState<
    | { kind: "unfiled"; count: number; undo: { id: string; tags: string[] }[] }
    | { kind: "deleted"; count: number }
    | null
  >(null);
  const [cleared, setCleared] = useState<ClearedPreferences | null>(null);

  const armId = useId();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Whether the page underneath is this tag's own index — in which case
   * finishing has to leave it, or the dialog closes onto an index of a tag
   * that no longer exists. Checked here rather than at the three call sites
   * because the rail opens this from wherever you happen to be standing.
   */
  const href = tagHref(tag);
  const viewingTag = pathname === href || pathname.startsWith(`${href}/`);

  function finish() {
    if (done && viewingTag) router.replace(ALL_NOTES_HREF);
    onClose();
  }

  function unfile() {
    startTransition(async () => {
      try {
        const result = await unfileTag({ tag });
        if (result.unfiled.length === 0) {
          setError("No notes carry that tag any more.");
          return;
        }
        setCleared(clearPreferences(tag));
        setDone({
          kind: "unfiled",
          count: result.unfiled.length,
          undo: result.unfiled,
        });
      } catch {
        setError("Couldn't remove that tag. Nothing was changed.");
      }
    });
  }

  /**
   * Opens the destructive screen — but reads the numbers first, so it arrives
   * complete. A confirmation that renders its own consequence a moment after
   * you are already looking at the button is a confirmation you have started
   * pressing past.
   */
  function openConfirm() {
    startTransition(async () => {
      try {
        setStats(await tagDeletionStats({ tag }));
        setView("confirm");
      } catch {
        setError("Couldn't count what that would delete.");
      }
    });
  }

  function deleteNotes() {
    startTransition(async () => {
      try {
        const result = await deleteTaggedNotes({ tag });
        // Emptied from somewhere else between opening this and arming it. Not
        // a success worth reporting: nothing was deleted, and "Deleted #tag
        // and 0 notes" reads as a bug rather than as the no-op it was.
        if (result.count === 0) {
          setError("No notes carry that tag any more.");
          return;
        }
        clearPreferences(tag);
        setDone({ kind: "deleted", count: result.count });
      } catch {
        setError("Couldn't delete those notes. Nothing was changed.");
      }
    });
  }

  function undo() {
    if (!done || done.kind !== "unfiled") return;
    startTransition(async () => {
      await restoreNoteTags({ entries: done.undo });
      if (cleared) restorePreferences(tag, cleared);
      // [onClose] rather than [finish]: the tag is back, so the index this was
      // opened over is a real page again and there is nothing to navigate away
      // from — which is exactly what finish would have done.
      onClose();
    });
  }

  // On the document rather than on the panel, unlike the rename dialog: that
  // one always has an autofocused field to catch the key, and this one opens on
  // a screen of two choices with focus still wherever the menu left it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const armed = normalizeTag(typed.trim()) === tag;
  const doomed = stats?.noteCount ?? noteCount;

  // Into <body>, for the reason spelled out in [TagRenameDialog]: `fixed` is a
  // utility and `.pane > *` is not, so a caller rendering this as a direct
  // child of its pane got it laid out in flow instead of over the viewport —
  // and this panel is the taller of the two, so it landed past the bottom of
  // the window and read as a dialog that never opened at all.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete #${tag}`}
      // Centred, as the rename dialog is. The three screens in here are
      // different heights, and anchoring the top would have the panel grow
      // downwards off an 18vh line as you move through them.
      className="scrim fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) finish();
      }}
    >
      <div className="glass lift-3 w-full max-w-md rounded-[var(--radius-zone)] p-6">
        {done ? (
          <>
            <p className="text-base text-ink">
              {done.kind === "unfiled" ? (
                <>
                  Removed <span className="text-ink-muted">#{tag}</span> from{" "}
                  {done.count} {done.count === 1 ? "note" : "notes"}.
                </>
              ) : (
                <>
                  Deleted <span className="text-ink-muted">#{tag}</span> and{" "}
                  {done.count} {done.count === 1 ? "note" : "notes"}.
                </>
              )}
            </p>
            {/* Said afterwards rather than before, because it is a reassurance
                and not a decision: nobody choosing between these two branches
                is weighing what happens to their prose. The word is still
                there, it just points at nothing now — which is a state this
                app already renders (see remarkHashtag) rather than a loose
                end left by the delete. */}
            {done.kind === "unfiled" && (
              <p className="mt-1 text-[13px] text-ink-muted">
                Their text is unchanged — any #{tag} written into a sentence
                stays as it was, no longer a link.
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              {done.kind === "unfiled" && (
                <button
                  type="button"
                  onClick={undo}
                  disabled={pending}
                  className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
                >
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={finish}
                className="row-tint row-selected rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink"
              >
                Done
              </button>
            </div>
          </>
        ) : view === "confirm" ? (
          <>
            <p className="text-base text-ink">
              Delete #{tag} and {doomed} {doomed === 1 ? "note" : "notes"}
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">
              {doomed === 1
                ? "Permanently deletes the note, along with any images only it was using."
                : `Permanently deletes all ${doomed}, along with any images only they were using.`}{" "}
              This can&apos;t be undone.
            </p>
            {/* The number the tag tree can't give: how many of these notes are
                somebody else's as well. A note tagged #{tag} and #reading is as
                much a reading note, and "{doomed} notes" says nothing about it
                — so it is said here, in --danger, above the field that arms
                the button rather than below it. */}
            {stats && stats.alsoTagged > 0 && (
              <p className="mt-2 text-[13px] text-danger">
                {stats.alsoTagged === 1
                  ? "One of them is also filed under other tags — it goes too."
                  : `${stats.alsoTagged} of them are also filed under other tags — they go too.`}
              </p>
            )}
            {/* Typed, not pressed twice. The one-note delete in the index is a
                small popover with a Keep and a Delete in it, which is the right
                weight for one row you are looking at; this is a batch you can't
                see, with no undo behind it, and the name is the only thing that
                proves you know which tag you are standing on. */}
            <label
              htmlFor={armId}
              className="mt-4 block text-[13px] text-ink-muted"
            >
              Type the tag&apos;s name to confirm
            </label>
            <div className="well mt-1.5 flex w-full items-baseline gap-0.5 rounded-[var(--radius-control)] bg-sunk px-3 py-2">
              <span aria-hidden className="text-base text-ink-faint">
                #
              </span>
              <input
                id={armId}
                autoFocus
                value={typed}
                // As the rename field: the `#` is a fixture to the left, so a
                // typed one is absorbed rather than counted against the match.
                onChange={(event) => {
                  setTyped(event.target.value.replace(/#/g, ""));
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && armed) deleteNotes();
                }}
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none focus-visible:outline-none!"
              />
            </div>
            {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              {/* Back, not Cancel: the choice is still on the other screen and
                  this is one step of two, so the way out leads there. */}
              <button
                type="button"
                onClick={() => {
                  setView("choose");
                  setTyped("");
                  setError(null);
                }}
                className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
              >
                Back
              </button>
              <button
                type="button"
                onClick={deleteNotes}
                disabled={!armed || pending}
                // Unseated and in --danger, where the rename dialog's default
                // is seated and in --ink. This is the one button in the app
                // that should not look like the obvious thing to press.
                className={`rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] ${
                  armed && !pending
                    ? "bg-danger-wash text-danger hover:text-danger-hover"
                    : "text-ink-faint"
                }`}
              >
                {pending
                  ? "Deleting…"
                  : `Delete ${doomed} ${doomed === 1 ? "note" : "notes"}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-ink">Delete #{tag}</p>
            {/* The count first, as the rename dialog does it: "every note that
                carries it" is true of a two-note tidy-up and a hundred-note
                migration alike, and those are different decisions. */}
            <p className="mt-1 text-[13px] text-ink-muted">
              Filed on {noteCount} {noteCount === 1 ? "note" : "notes"}. Any 
              nested tags are deleted too.
            </p>

            {/* Two rows rather than a choice control with a confirm under it.
                The branches aren't settings of one operation — they are two
                different things to do, and each row is its own press. */}
            <div className="mt-4 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={unfile}
                disabled={pending}
                className="row-tint w-full rounded-[var(--radius-control)] px-3 py-2.5 text-left"
              >
                <span className="block text-[13px] text-ink">
                  Remove the tag
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-muted">
                  Notes stay, but stop being filed under #{tag}.
                </span>
              </button>

              <button
                type="button"
                onClick={openConfirm}
                disabled={pending}
                className="row-tint w-full rounded-[var(--radius-control)] px-3 py-2.5 text-left hover:bg-danger-wash"
              >
                <span className="block text-[13px] text-danger">
                  Delete the tag and its notes
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-muted">
                  Permanently deletes  {noteCount}{" "}
                  {noteCount === 1 ? "note" : "notes"}. This can&apos;t be undone.
                </span>
              </button>
            </div>

            {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={finish}
                className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
