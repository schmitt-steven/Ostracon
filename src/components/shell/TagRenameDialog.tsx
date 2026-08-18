"use client";

import { useState, useTransition } from "react";
import { renameTag } from "@/lib/notes/actions";
import { isValidTag, normalizeTag } from "@/lib/tags/parse";

type Props = {
  tag: string;
  onClose: () => void;
};

/**
 * Renaming a tag rewrites the note bodies that carry it — there is nowhere
 * else the name is stored, so this is a find-and-replace across the notes and
 * nothing more.
 *
 * Undo is offered because the operation is genuinely undoable: the action
 * returns the notes it touched, and running it again with the names swapped
 * over exactly those notes puts everything back. Notes that already used the
 * new name are untouched by both directions.
 */
export function TagRenameDialog({ tag, onClose }: Props) {
  const [name, setName] = useState(tag);
  const [pending, startTransition] = useTransition();
  const [undo, setUndo] = useState<{ to: string; noteIds: string[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const target = normalizeTag(name.trim().replace(/^#/, ""));
  const valid = isValidTag(target) && target !== tag;

  function submit() {
    if (!valid) return;
    startTransition(async () => {
      try {
        const result = await renameTag({ from: tag, to: target });
        if (result.noteIds.length === 0) {
          setError("No notes carry that tag any more.");
          return;
        }
        setUndo({ to: target, noteIds: result.noteIds });
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Rename #${tag}`}
      className="fixed inset-0 z-50 flex items-start justify-center bg-shade/40 p-6 pt-[18vh]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-[var(--radius-zone)] bg-surface p-6 shadow-xl shadow-shade/25">
        {undo ? (
          <>
            <p className="text-base text-ink">
              Renamed <span className="text-ink-muted">#{tag}</span> to{" "}
              <span className="text-ink-muted">#{undo.to}</span> across{" "}
              {undo.noteIds.length}{" "}
              {undo.noteIds.length === 1 ? "note" : "notes"}.
            </p>
            <div className="mt-5 flex items-center gap-2">
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
                className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-ink">Rename #{tag} everywhere</p>
            <p className="mt-1 text-[13px] text-ink-muted">
              Rewrites every note that carries it. Nested tags come along.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
                if (event.key === "Escape") onClose();
              }}
              spellCheck={false}
              className="mt-4 w-full rounded-[var(--radius-control)] bg-paper-sunk px-3 py-2 text-base text-ink outline-none"
            />
            {error && (
              <p className="mt-2 text-[13px] text-danger">{error}</p>
            )}
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={!valid || pending}
                className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink disabled:text-ink-faint"
              >
                {pending ? "Renaming…" : "Rename"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
