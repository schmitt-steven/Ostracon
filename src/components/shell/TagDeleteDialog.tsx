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
  /** Notes under this tag or beneath it — as [TagRenameDialog]. The
   * destructive branch re-counts via [tagDeletionStats]. */
  noteCount: number;
  onClose: () => void;
};

/** The localStorage tag prefs cleared on delete (no server action can reach
 * them), kept for undo — otherwise a deleted tag's name stays pinned forever. */
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

  // Only when the tag is a root — hues are stored per root (see [setTagHue]).
  const root = tagRoot(tag);
  const hue = root === tag ? (before.hues[root] ?? null) : null;
  if (hue !== null) setTagHue(tag, null);

  return { pinned, hue };
}

function restorePreferences(tag: string, cleared: ClearedPreferences): void {
  // Back to front — each pin prepends its name.
  for (const name of [...cleared.pinned].reverse()) togglePinned(name);
  if (cleared.hue !== null) setTagHue(tag, cleared.hue);
}

/**
 * Deleting a tag, both meanings. There's no tag row, only the notes: one
 * branch unfiles them (fully undoable, acts on its press), the other deletes
 * them (irreversible, opens a type-the-name screen). Nested tags come along in
 * both, or the parent would reappear in the tree.
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

  // Whether the page underneath is this tag's own index — then finishing has
  // to navigate away.
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

  // Opens the destructive screen, reading the numbers first so it arrives
  // complete.
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
        // Emptied elsewhere between opening and arming — a no-op, not a success.
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
      // [onClose], not [finish] — the tag is back, nothing to navigate from.
      onClose();
    });
  }

  // On the document (not the panel) — this opens with focus wherever the menu
  // left it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const armed = normalizeTag(typed.trim()) === tag;
  const doomed = stats?.noteCount ?? noteCount;

  // Into <body>, as [TagRenameDialog].
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete #${tag}`}
      // Centred — the three screens are different heights.
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
            {/* A reassurance, said afterwards — a `#{tag}` in prose stays as
                an unresolved reference (see remarkHashtag). */}
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
            {/* The number the tag tree can't give — how many are also filed
                elsewhere. */}
            {stats && stats.alsoTagged > 0 && (
              <p className="mt-2 text-[13px] text-danger">
                {stats.alsoTagged === 1
                  ? "One of them is also filed under other tags — it goes too."
                  : `${stats.alsoTagged} of them are also filed under other tags — they go too.`}
              </p>
            )}
            {/* Typed, not pressed twice — this is an unseen batch with no undo. */}
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
                // The `#` is a fixture; a typed one is absorbed.
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
              {/* Back, not Cancel — this is step two of two. */}
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
                // Unseated, in --danger — the one button that shouldn't look
                // like the obvious press.
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
            {/* The count first, as the rename dialog. */}
            <p className="mt-1 text-[13px] text-ink-muted">
              Filed on {noteCount} {noteCount === 1 ? "note" : "notes"}. Any
              nested tags are deleted too.
            </p>

            {/* Two rows — two different things to do, each its own press. */}
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
