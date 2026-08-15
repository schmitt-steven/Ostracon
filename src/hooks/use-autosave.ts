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

export function useAutosave({
  initialNoteId,
  initialVersion,
  onCreated,
}: UseAutosaveArgs) {
  const noteIdRef = useRef(initialNoteId);
  const versionRef = useRef(initialVersion);
  const creatingRef = useRef<Promise<CreateNoteResult> | null>(null);
  const draftRef = useRef<NoteDraft>({ title: "", bodyMd: "", tags: [] });

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

    // Loop instead of recursing into flush() again from the finally block
    // below: a save that raced in while this one was in flight sets
    // pendingFlushRef, and this retries in place rather than calling
    // itself (self-referential calls block the React Compiler from
    // verifying this callback's memoization).
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
          void idbDel(draftKey(null));
          onCreated({ id: created.id, slug: created.slug });
          setStatus("saved");
        } else {
          const result: UpdateNoteResult = await updateNote({
            id: noteIdRef.current,
            expectedVersion: versionRef.current,
            ...payload,
          });
          if (result.ok) {
            versionRef.current = result.version;
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
        // Keep the local draft and let the next scheduled save (or an
        // explicit retry) pick it back up — nothing typed is lost, it
        // just hasn't reached the server yet.
        dirtyRef.current = true;
        setStatus("error");
      } finally {
        savingRef.current = false;
        creatingRef.current = null;
      }

      if (!pendingFlushRef.current) return;
      pendingFlushRef.current = false;
    }
  }, [onCreated]);

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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
