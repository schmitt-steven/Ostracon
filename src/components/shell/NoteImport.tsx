"use client";

import { PlusLargeIcon } from "@/icons";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  batchImportFiles,
  IMPORT_ACCEPT,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_FILES,
  readImportFiles,
  type SkippedFile,
  type SkipReason,
} from "@/lib/notes/import-files";
import { collectDroppedFiles } from "@/lib/notes/drop-files";
import { getImageTarget } from "@/lib/images/insert-target";
import { looksLikeImageType } from "@/lib/images/upload-rules";
import { importNotes, type ImportedNote } from "@/lib/notes/import";
import { subscribeNoteImport } from "@/lib/notes/import-request";
import { ALL_NOTES_HREF, noteHref } from "@/lib/tags/routes";

/** As long as the save hint's — long enough to read a sentence, not a glance. */
const DONE_VISIBLE_MS = 4500;

/** What a drag in flight would do: make notes, or fill the one that's open. */
type DragKind = "notes" | "images";

type Status =
  | { kind: "idle" }
  | { kind: "working"; count: number }
  | { kind: "done"; notes: ImportedNote[]; skipped: SkippedFile[] }
  | { kind: "failed" };

/**
 * Getting notes in from outside — `.md`/`.txt` files become notes, one per
 * file. Two ways in (window drop, ⌘K "Import files"), both landing in
 * [runImport]. Mounted in the shell because the drop target is the whole
 * window. A dropped folder is walked for files (see [collectDroppedFiles]).
 *
 * Images in a drop go to the open editor (lib/images/insert-target) at the
 * drop point; a mixed drop splits. The drop is always claimed — an unclaimed
 * file drop is a navigation that replaces the page.
 */
export function NoteImport() {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragKind, setDragKind] = useState<DragKind>("notes");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [, startTransition] = useTransition();

  // Whether an import is in flight — a ref, since the once-attached drop
  // handler reads it at drop time.
  const busyRef = useRef(false);

  const runImport = useCallback(
    // `refused` carries files never read (images dropped with no note open),
    // travelling with the import so one drop is one sentence.
    (files: File[], refused: SkippedFile[] = []) => {
      // Ignore a second drop while the first is going.
      if (busyRef.current) return;
      busyRef.current = true;

      startTransition(async () => {
        try {
          const read = await readImportFiles(files);
          const accepted = read.accepted;
          const skipped = [...refused, ...read.skipped];
          if (accepted.length === 0) {
            setStatus({ kind: "done", notes: [], skipped });
            return;
          }

          setStatus({ kind: "working", count: accepted.length });
          const created: ImportedNote[] = [];
          // Sequentially, in batches (see [batchImportFiles]).
          for (const batch of batchImportFiles(accepted)) {
            created.push(...(await importNotes(batch)));
          }
          setStatus({ kind: "done", notes: created, skipped });

          // One file opens its note; several go to the index.
          const first = created[0];
          const destination =
            created.length === 1 && first
              ? noteHref(first.slug)
              : ALL_NOTES_HREF;
          if (created.length === 0) return;
          if (destination === pathname) {
            // Already here — a push wouldn't re-render.
            router.refresh();
          } else {
            router.push(destination);
          }
        } catch {
          // Bad payload, or an expired session.
          setStatus({ kind: "failed" });
        } finally {
          busyRef.current = false;
        }
      });
    },
    [pathname, router],
  );

  // ⌘K's row — synchronous inside the gesture, or the dialog won't open.
  useEffect(() => subscribeNoteImport(() => inputRef.current?.click()), []);

  /**
   * The third way in: a .md opened from the desktop, via the manifest's
   * file_handlers. Consumed here because the queue may only be claimed once
   * per page load and this component is mounted exactly once — and because the
   * files want [runImport] anyway, same as a drop.
   *
   * Chromium desktop only; everywhere else `launchQueue` is undefined.
   */
  useEffect(() => {
    const queue = window.launchQueue;
    if (!queue) return;

    queue.setConsumer((params) => {
      if (params.files.length === 0) return;
      void Promise.all(params.files.map((handle) => handle.getFile()))
        .then(runImport)
        // A handle whose file has since moved or been revoked.
        .catch(() => setStatus({ kind: "failed" }));
    });
  }, [runImport]);

  useEffect(() => {
    // "left the window" = the dragenter/dragleave depth count reaching zero.
    let depth = 0;

    // File drags only — a text drag is CodeMirror's.
    function carriesFiles(event: DragEvent): boolean {
      return event.dataTransfer?.types.includes("Files") ?? false;
    }

    // What the drop would do — only the item types are readable mid-drag,
    // enough to tell an image from a file (wrong only harmlessly, e.g. SVG).
    function kindOf(event: DragEvent): DragKind {
      const items = event.dataTransfer ? [...event.dataTransfer.items] : [];
      const images = items.some(
        (item) => item.kind === "file" && looksLikeImageType(item.type),
      );
      return images && getImageTarget() ? "images" : "notes";
    }

    function onDragEnter(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragKind(kindOf(event));
      setDragging(true);
    }

    function onDragOver(event: DragEvent) {
      if (!carriesFiles(event)) return;
      // Or the browser opens the file instead of dropping it.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(event: DragEvent) {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    }

    function onDrop(event: DragEvent) {
      if (!carriesFiles(event) || !event.dataTransfer) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);

      // Read entries and the drop point now — both go stale after the event.
      const at = { x: event.clientX, y: event.clientY };
      void collectDroppedFiles(event.dataTransfer).then((files) => {
        if (files.length === 0) return;

        // Split by what each file is — a mixed drop does both.
        const images = files.filter((file) => looksLikeImageType(file.type));
        const rest = files.filter((file) => !looksLikeImageType(file.type));
        const target = getImageTarget();

        if (images.length > 0 && target) target(images, at);

        // No note open ⇒ nowhere for an image to go.
        const homeless: SkippedFile[] = target
          ? []
          : images.map((file) => ({ name: file.name, reason: "no-note" }));

        if (rest.length > 0 || homeless.length > 0) runImport(rest, homeless);
      });
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [runImport]);

  // The result auto-clears; a failure doesn't.
  useEffect(() => {
    if (status.kind !== "done") return;
    const timer = setTimeout(() => setStatus({ kind: "idle" }), DONE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <>
      {/* Hidden — opened only by [requestNoteImport]. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // Cleared so picking the same file twice still fires.
          event.target.value = "";
          if (files.length > 0) runImport(files);
        }}
      />

      {dragging && <DropOverlay kind={dragKind} />}

      <ImportToast
        status={status}
        onDismiss={() => setStatus({ kind: "idle" })}
      />
    </>
  );
}

/**
 * What a drop would do. Notes: a centred card over a dimmed window. Images: a
 * hint at the bottom edge, nothing dimmed (the note is the target). Both
 * pointer-events-none so the drag depth count doesn't come apart.
 */
function DropOverlay({ kind }: { kind: DragKind }) {
  // Dashed, not glass — an outline around a space to be filled, not a surface.
  const card =
    "bg-paper flex flex-col items-center rounded-[var(--radius-zone)] border-2 border-dashed border-[color-mix(in_srgb,var(--ink)_25%,transparent)] text-center";

  if (kind === "images") {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center px-6"
      >
        <div className={`${card} px-7 py-5`}>
          <PlusLargeIcon aria-hidden className="size-7 text-ink-faint" />
          <p className="mt-2 font-display text-[17px] font-medium text-ink">
            Drop to add images
          </p>
          <p className="mt-[var(--space-hair)] text-[13px] text-ink-muted">
            They land in this note, where you drop them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="scrim pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-6"
    >
      <div className={`${card} px-10 py-8`}>
        <PlusLargeIcon aria-hidden className="size-7 text-ink-faint" />
        <p className="mt-3 font-display text-[20px] font-medium text-ink">
          Drop to import
        </p>
        <p className="mt-[var(--space-hair)] text-[13px] text-ink-muted">
          Every .md or .txt file becomes a note, named after the file.
        </p>
      </div>
    </div>
  );
}

/** What happened, top-right, in the save toast's frame. */
function ImportToast({
  status,
  onDismiss,
}: {
  status: Status;
  onDismiss: () => void;
}) {
  if (status.kind === "idle") return null;
  // Nothing to report.
  if (
    status.kind === "done" &&
    status.notes.length === 0 &&
    status.skipped.length === 0
  ) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-6 top-[calc(var(--head-h)+1.25rem)] z-40 flex max-w-xs flex-col items-end gap-2 text-right">
      <p
        role="status"
        className="glass lift-2 toast-enter pointer-events-auto rounded-[var(--radius-control)] px-4 py-2.5 text-[13px] text-ink"
      >
        {status.kind === "working" && <>Importing {fileCount(status.count)}…</>}
        {status.kind === "failed" && (
          <>
            Couldn&apos;t import those files.{" "}
            <button
              type="button"
              onClick={onDismiss}
              className="text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Dismiss
            </button>
          </>
        )}
        {status.kind === "done" && (
          <>
            {importedLine(status.notes)}
            {skipLine(status.skipped) && (
              <span className="block text-ink-muted">
                {skipLine(status.skipped)}
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}

function fileCount(count: number): string {
  return `${count} file${count === 1 ? "" : "s"}`;
}

/** The headline — what landed, named when it's one; null when nothing did. */
function importedLine(notes: ImportedNote[]): string | null {
  if (notes.length === 0) return null;
  if (notes.length === 1) return `Imported “${notes[0]!.title}”.`;
  return `Imported ${notes.length} notes.`;
}

/** What didn't, grouped by cause and counted, not listed by name. */
function skipLine(skipped: SkippedFile[]): string | null {
  if (skipped.length === 0) return null;

  const counts = new Map<SkipReason, number>();
  for (const file of skipped) {
    counts.set(file.reason, (counts.get(file.reason) ?? 0) + 1);
  }

  const clauses: string[] = [];
  const wrongType = counts.get("type") ?? 0;
  if (wrongType > 0) {
    clauses.push(`${fileCount(wrongType)} skipped — only .md and .txt`);
  }
  const tooBig = counts.get("size") ?? 0;
  if (tooBig > 0) {
    clauses.push(`${fileCount(tooBig)} over ${MAX_IMPORT_BYTES / 1024}KB`);
  }
  const tooMany = counts.get("too-many") ?? 0;
  if (tooMany > 0) {
    clauses.push(`${fileCount(tooMany)} past the ${MAX_IMPORT_FILES} per drop`);
  }
  const unreadable = counts.get("unreadable") ?? 0;
  if (unreadable > 0) {
    clauses.push(`${fileCount(unreadable)} couldn't be read`);
  }
  const homeless = counts.get("no-note") ?? 0;
  if (homeless > 0) {
    clauses.push(
      `open a note to put ${homeless === 1 ? "that image" : "those images"} in`,
    );
  }

  return `${clauses.join(" · ")}.`;
}
