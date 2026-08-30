"use client";

import { del as idbDel, set as idbSet } from "idb-keyval";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNote,
  updateNote,
  type CreateNoteResult,
  type UpdateNoteResult,
} from "@/lib/notes/actions";

const DEBOUNCE_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "conflict" | "error";

// `tags` rides along with the text — the tag bar is the filing (see notes/actions).
export type NoteDraft = {
  title: string;
  bodyMd: string;
  tags: string[];
};

type ConflictInfo = { version: number; contentMd: string; updatedAt: Date };

type UseAutosaveArgs = {
  initialNoteId: string | null;
  initialVersion: number;
  onCreated: (result: { id: string; slug: string }) => void;
};

function draftKey(noteId: string | null) {
  return `skb:draft:${noteId ?? "new"}`;
}

// The newest version this tab has written, per note. Module state so it
// outlives an editor remount, which would otherwise hand a stale
// `initialVersion` to the next save and trigger a false conflict. Read only as
// a floor — a version this tab didn't write is a real conflict.
const lastWritten = new Map<string, number>();

export function useAutosave({
  initialNoteId,
  initialVersion,
  onCreated,
}: UseAutosaveArgs) {
  const noteIdRef = useRef(initialNoteId);
  const versionRef = useRef(
    Math.max(initialVersion, lastWritten.get(initialNoteId ?? "") ?? 0),
  );
  const creatingRef = useRef<Promise<CreateNoteResult> | null>(null);
  const draftRef = useRef<NoteDraft>({ title: "", bodyMd: "", tags: [] });

  // Through a ref so `flush` stays stable — the caller's callback is an inline
  // closure, and depending on it directly would re-run the unmount effect's
  // cleanup every render.
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  });

  // Editor gone — the save still finishes, but `onCreated`'s URL swap is
  // skipped so the user isn't left at the index under a note's address.
  const unmountedRef = useRef(false);

  // This mount created a note and swapped its URL in place. From here the
  // address and the rendered tree are different routes, so the server must not
  // refresh the router — see `canRefreshShell` in notes/actions.
  const swappedUrlRef = useRef(false);

  const [status, setStatus] = useState<SaveStatus>(
    initialNoteId ? "saved" : "idle",
  );
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingFlushRef = useRef(false);

  const flush = useCallback(async () => {
    if (savingRef.current) {
      pendingFlushRef.current = true;
      return;
    }

    // Loop, not self-recursion, to pick up a save that raced in (the React
    // Compiler can't verify a self-referential callback).
    for (;;) {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      savingRef.current = true;
      setStatus("saving");

      const payload = draftRef.current;
      try {
        if (!noteIdRef.current) {
          creatingRef.current ??= createNote(payload);
          const created = await creatingRef.current;
          noteIdRef.current = created.id;
          versionRef.current = created.version;
          lastWritten.set(created.id, created.version);
          void idbDel(draftKey(null));
          if (!unmountedRef.current) {
            onCreatedRef.current({ id: created.id, slug: created.slug });
            swappedUrlRef.current = true;
          }
          setStatus("saved");
        } else {
          const result: UpdateNoteResult = await updateNote({
            id: noteIdRef.current,
            expectedVersion: versionRef.current,
            canRefreshShell: !swappedUrlRef.current,
            ...payload,
          });
          if (result.ok) {
            versionRef.current = result.version;
            lastWritten.set(noteIdRef.current, result.version);
            void idbDel(draftKey(noteIdRef.current));
            setConflict(null);
            setStatus("saved");
          } else if ("conflict" in result) {
            setStatus("conflict");
            setConflict({
              version: result.version,
              contentMd: result.contentMd,
              updatedAt: result.updatedAt,
            });
          } else {
            setStatus("error");
          }
        }
      } catch {
        // Keep the draft dirty so the next save retries it — nothing is lost.
        dirtyRef.current = true;
        setStatus("error");
      } finally {
        savingRef.current = false;
        creatingRef.current = null;
      }

      if (!pendingFlushRef.current) return;
      pendingFlushRef.current = false;
    }
  }, []);

  const scheduleSave = useCallback(
    (draft: NoteDraft) => {
      draftRef.current = draft;
      dirtyRef.current = true;
      void idbSet(draftKey(noteIdRef.current), {
        ...draft,
        savedAt: Date.now(),
        baseVersion: versionRef.current,
      });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [flush]);

  // Flush on unmount so leaving mid-debounce doesn't lose the last edit — the
  // action outlives the component.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) void flush();
    };
  }, [flush]);

  const keepMine = useCallback(async () => {
    if (!conflict) return;
    versionRef.current = conflict.version;
    setConflict(null);
    dirtyRef.current = true;
    await flush();
  }, [conflict, flush]);

  return {
    status,
    conflict,
    scheduleSave,
    flush,
    keepMine,
  };
}
