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

// `tags` rides along with the text rather than being read back out of it: the
// tag bar is the note's filing, and a body hashtag is only a reference to a
// tag that already exists (see notes/actions).
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

/**
 * The newest version this tab has written, per note.
 *
 * Module state on purpose: it has to outlive any single mount of the editor.
 * `initialVersion` is whatever a server render said, and a remount hands the
 * fresh instance that number — which, for a note this tab has been saving
 * since, is behind. The next save then arrives with an expectedVersion the row
 * has already moved past, the update matches nothing, and the editor accuses
 * the user of having the note open in another tab when they have it open in
 * one. A remount is no longer supposed to happen mid-edit at all, but "my own
 * saves are invisible to me" is not a thing worth leaving one reload away.
 *
 * Only ever read as a floor, never as the truth: a version this tab did not
 * write can only have come from somewhere that did, and that is exactly the
 * conflict the check exists to catch.
 */
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

  // Read through a ref so `flush` — and `scheduleSave` with it — can be
  // stable across renders. The caller's callback is an inline closure over
  // its own state, so depending on it directly would rebuild both on every
  // keystroke, and would make the unmount effect below tear down and re-run
  // its cleanup on every render (saving, constantly, instead of once on the
  // way out).
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  });

  // Set while the editor is gone. The save still has to finish — it's the
  // user's text — but `onCreated` swaps the URL for the note it just made,
  // and doing that to a page the user has already navigated away from would
  // leave them looking at the index under a note's address.
  const unmountedRef = useRef(false);

  // Set once this mount has created a note and handed its URL to `onCreated`,
  // which swaps it in place rather than navigating. From then on the address
  // bar and the rendered tree belong to different routes, and the server must
  // not refresh the client router until a real navigation reconciles them —
  // see `canRefreshShell` in notes/actions.
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

  // Leaving mid-debounce used to lose the last edit: the timer was cleared
  // and nothing took its place, so up to DEBOUNCE_MS of typing went with the
  // page. Send it instead — the action outlives the component, and a save
  // already in flight is picked up by pendingFlushRef.
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
