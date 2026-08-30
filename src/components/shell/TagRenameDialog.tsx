"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { renameTag } from "@/lib/notes/actions";
import {
  isValidTag,
  knownTagSet,
  normalizeTag,
  tagMatches,
} from "@/lib/tags/parse";
import { useKnownTags } from "./KnownTags";

type Props = {
  tag: string;
  /** Notes carrying this tag or any beneath it — what will be rewritten.
   * Counted by whoever opened this (the rail/index already has the number). */
  noteCount: number;
  onClose: () => void;
};

/**
 * Renaming a tag is a find-and-replace across the notes that carry it — the
 * name is stored nowhere else. The count is on the dialog's face because a
 * two-note tidy-up and a hundred-note migration are different decisions. Undo
 * is exact (the action returns the notes it touched). Renaming onto an
 * existing name merges the two — warned about, not blocked; see `merging`.
 */
export function TagRenameDialog({ tag, noteCount, onClose }: Props) {
  // Never carries the `#` — the field shows one as a fixture.
  const [name, setName] = useState(tag);
  const [pending, startTransition] = useTransition();
  const [undo, setUndo] = useState<{
    to: string;
    noteIds: string[];
    /** Captured at the press — the field can change after. */
    merged: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mergeNoticeId = useId();
  const knownTags = useKnownTags();
  // Ancestors expanded — a name is taken once anything is filed beneath it.
  const existing = useMemo(() => knownTagSet([knownTags]), [knownTags]);

  const target = normalizeTag(name.trim());
  const valid = isValidTag(target) && target !== tag;

  // Whether this rename is really a merge (target already exists, and isn't a
  // descendant of the tag being renamed).
  const merging = valid && existing.has(target) && !tagMatches(target, tag);

  function submit() {
    if (!valid) return;
    startTransition(async () => {
      try {
        const result = await renameTag({ from: tag, to: target });
        if (result.noteIds.length === 0) {
          setError("No notes carry that tag any more.");
          return;
        }
        setUndo({ to: target, noteIds: result.noteIds, merged: merging });
      } catch {
        setError("Couldn't rename that tag. Nothing was changed.");
      }
    });
  }

  function revert() {
    if (!undo) return;
    startTransition(async () => {
      await renameTag({ from: undo.to, to: tag, onlyIds: undo.noteIds });
      onClose();
    });
  }

  // Into <body> — `.pane > *` sets `position`, so a dialog rendered inside a
  // pane (the tag directory) would lay out in flow.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Rename #${tag}`}
      // Centred, like the log-out dialog.
      className="scrim fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="glass lift-3 w-full max-w-md rounded-[var(--radius-zone)] p-6">
        {undo ? (
          <>
            <p className="text-base text-ink">
              {undo.merged ? "Merged" : "Renamed"}{" "}
              <span className="text-ink-muted">#{tag}</span>{" "}
              {undo.merged ? "into" : "to"}{" "}
              <span className="text-ink-muted">#{undo.to}</span> across{" "}
              {undo.noteIds.length}{" "}
              {undo.noteIds.length === 1 ? "note" : "notes"}.
            </p>
            {/* Undo touches only the notes that moved. */}
            {undo.merged && (
              <p className="mt-1 text-[13px] text-ink-muted">
                Undo moves those {undo.noteIds.length === 1 ? "note" : "notes"}{" "}
                back to #{tag}; notes already filed under #{undo.to} stay put.
              </p>
            )}
            {/* Undo left, Done right. */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={revert}
                disabled={pending}
                className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={onClose}
                className="row-tint row-selected rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-ink">Rename #{tag} everywhere</p>
            {/* The count of notes under the whole subtree — the set the rename
                touches. */}
            <p className="mt-1 text-[13px] text-ink-muted">
              Rewrites {noteCount} {noteCount === 1 ? "note" : "notes"}. Nested
              tags come along.
            </p>
            {/* The `#` is a fixture, not part of the value. */}
            <div className="well mt-4 flex w-full items-baseline gap-0.5 rounded-[var(--radius-control)] bg-sunk px-3 py-2">
              <span aria-hidden className="text-base text-ink-faint">
                #
              </span>
              <input
                autoFocus
                value={name}
                aria-label={`New name for #${tag}`}
                // So the merge notice is announced with the field.
                aria-describedby={merging ? mergeNoticeId : undefined}
                onChange={(event) => {
                  // Typed `#`es are dropped — the field shows one already.
                  setName(event.target.value.replace(/#/g, ""));
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                  if (event.key === "Escape") onClose();
                }}
                spellCheck={false}
                // `.well` is the field's edge.
                className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none focus-visible:outline-none!"
              />
            </div>
            {/* Under the field, in --accent (not --danger) — merging is an
                outcome to be sure about, not a mistake. */}
            {merging && (
              <p id={mergeNoticeId} className="mt-2 text-[13px] text-accent">
                #{target} already exists. Renaming merges the two — every note
                under #{tag} joins it, and nested tags merge alongside.
              </p>
            )}
            {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
            {/* Right end, cancel first — the app's dialog order. */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!valid || pending}
                // Seated (the default), and stands down while there's nothing
                // to submit.
                className={`row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] ${
                  valid && !pending ? "row-selected text-ink" : "text-ink-faint"
                }`}
              >
                {pending ? "Renaming…" : merging ? "Rename & merge" : "Rename"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
