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
  /**
   * Notes carrying this tag or any tag beneath it — what the dialog says will
   * be rewritten. Counted by whoever opened it, because the two places that do
   * already have the number: the rail from its tree node, the index from the
   * list it is showing.
   */
  noteCount: number;
  onClose: () => void;
};

/**
 * Renaming a tag rewrites the note bodies that carry it — there is nowhere
 * else the name is stored, so this is a find-and-replace across the notes and
 * nothing more.
 *
 * Which is why the count is on the face of the dialog rather than only in the
 * confirmation afterwards. "Rewrites every note that carries it" is true and
 * says nothing about whether this is a two-note tidy-up or a hundred-note
 * migration — and those are different decisions.
 *
 * Undo is offered because the operation is genuinely undoable: the action
 * returns the notes it touched, and running it again with the names swapped
 * over exactly those notes puts everything back. Notes that already used the
 * new name are untouched by both directions.
 *
 * The one rename that isn't just a rename is a rename onto a name already in
 * use: with no tag table to collide in, the two simply become one. That is a
 * real thing to want, so it is warned about rather than blocked — see
 * `merging` below.
 */
export function TagRenameDialog({ tag, noteCount, onClose }: Props) {
  // Never carries the `#` — the field wears one permanently to its left (see
  // below), so what is typed here is only ever the name.
  const [name, setName] = useState(tag);
  const [pending, startTransition] = useTransition();
  const [undo, setUndo] = useState<{
    to: string;
    noteIds: string[];
    /** Kept from the moment of the press: what the field says after it is no
     *  longer what happened. */
    merged: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mergeNoticeId = useId();
  const knownTags = useKnownTags();
  // Ancestors expanded, because a name is taken as soon as anything is filed
  // beneath it: `#infra` is a real index the moment `#infra/ci` exists, and
  // renaming onto it lands in the same tree either way.
  const existing = useMemo(() => knownTagSet([knownTags]), [knownTags]);

  const target = normalizeTag(name.trim());
  const valid = isValidTag(target) && target !== tag;

  /**
   * Whether this rename is really a merge.
   *
   * Renaming onto a name that already exists doesn't fail and doesn't ask —
   * the notes are the only record of which tags exist, so two tags with one
   * name *are* one tag. That's a legitimate way to tidy up (`#k8s` into
   * `#kubernetes`), and it is also the least reversible thing this dialog can
   * do, which is why it is said out loud before the press rather than
   * discovered afterwards in a tag with twice the notes in it.
   *
   * A target beneath the tag being renamed is not a merge: renaming `#a` to
   * `#a/b` carries the existing `#a/b` down to `#a/b/b` along with everything
   * else under `#a`, so nothing collides.
   */
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

  // Into <body>, as [ContextMenu] is and for a sharper version of the same
  // reason: `fixed` is a utility, and this app's own rules are unlayered, so
  // any of them that sets `position` on an ancestor's child outranks it —
  // `.pane > *` does exactly that, and a caller that happens to render this as
  // a direct child of its pane (the tag directory) got a dialog laid out in
  // flow below a full-height scroller instead of over the viewport. Portalling
  // takes the question away from the call site rather than asking three of them
  // to remember where they mount it.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Rename #${tag}`}
      // Centred, like the log-out dialog: this one is short, holds a single
      // field, and has no list under it that wanted the room at the bottom.
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
            {/* Undo is exact over the notes that moved, and only those — the
                notes that were already filed under #{undo.to} were never
                touched, so walking the merge back leaves them where they
                are. Said here because "Undo" next to a merge otherwise reads
                as a promise to unpick the whole tag. */}
            {undo.merged && (
              <p className="mt-1 text-[13px] text-ink-muted">
                Undo moves those {undo.noteIds.length === 1 ? "note" : "notes"}{" "}
                back to #{tag}; notes already filed under #{undo.to} stay put.
              </p>
            )}
            {/* Right-hand end, and the way out on the left of the way on — the
                same order as the pair below, because after the rename Undo is
                the one that walks it back and Done is the one that accepts it. */}
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
            {/* The number, not "every note that carries it". Nested tags are
                already inside it — the count is of notes under the whole
                subtree, which is exactly the set the rename touches. */}
            <p className="mt-1 text-[13px] text-ink-muted">
              Rewrites {noteCount} {noteCount === 1 ? "note" : "notes"}. Nested
              tags come along.
            </p>
            {/* The `#` is part of the field, not part of the value. A tag is
                written `#thing` everywhere else in this app, so a bare box is a
                box you have to guess at — and the guess people make is to type
                the `#`, which then has to be stripped back off. Showing it as a
                fixture answers the question and removes the choice. */}
            <div className="well mt-4 flex w-full items-baseline gap-0.5 rounded-[var(--radius-control)] bg-sunk px-3 py-2">
              <span aria-hidden className="text-base text-ink-faint">
                #
              </span>
              <input
                autoFocus
                value={name}
                aria-label={`New name for #${tag}`}
                // So the merge notice is read out as part of the field rather
                // than being left as text a screen reader only reaches by
                // walking past the buttons.
                aria-describedby={merging ? mergeNoticeId : undefined}
                onChange={(event) => {
                  // Typed or pasted `#`es are dropped rather than rejected: the
                  // field already shows one, and the habit is worth absorbing
                  // quietly instead of erroring at.
                  setName(event.target.value.replace(/#/g, ""));
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                  if (event.key === "Escape") onClose();
                }}
                spellCheck={false}
                // The well is the field's edge; the input inside it draws
                // nothing of its own.
                className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none focus-visible:outline-none!"
              />
            </div>
            {/* Under the field, where what was just typed is still being
                looked at — and in --accent rather than --danger, because
                merging is an outcome to be sure about, not a mistake to be
                stopped from making. The button below says the same thing so
                the two halves of the press agree. */}
            {merging && (
              <p id={mergeNoticeId} className="mt-2 text-[13px] text-accent">
                #{target} already exists. Renaming merges the two — every note
                under #{tag} joins it, and nested tags merge alongside.
              </p>
            )}
            {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
            {/* Right-hand end, cancel first. Dialog buttons sat left and
                confirm-first, which put the destructive-looking half of the
                pair under the pointer's resting path and read as a toolbar
                rather than as the end of a sentence. */}
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
                // Seated rather than flat, and only this one: with the pair at
                // the end of the row, which of the two is the default has to be
                // legible without reading both labels. It stands down while
                // there is nothing to submit — a lit button over a name that
                // can't be saved is the interface promising something.
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
