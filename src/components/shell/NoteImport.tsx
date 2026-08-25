"use client";

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
 * Getting notes in from outside: `.md` and `.txt` files become notes, one
 * note per file, titled after the file and holding whatever was in it.
 *
 * Two ways in, and they are the same way twice. Dropping files anywhere on the
 * window is the one you reach for with a folder already open; ⌘K's "Import
 * files" is the one you reach for when the files are somewhere you'd have to
 * go and find. Both land in [runImport] below, so there is one set of rules
 * about what may be imported (lib/notes/import-files) and one sentence about
 * what happened.
 *
 * Mounted in the shell, beside the palette, for the same reason it is:
 * the drop target is the whole window rather than any one view, and no route
 * should have to remember to offer this.
 *
 * **Images are somebody else's.** This is the only handler listening for file
 * drops, so it is also where an image dropped onto an open note arrives — and
 * an image is not a note, it belongs *in* one. Those are handed to whichever
 * editor is on screen (lib/images/insert-target) at the exact spot they were
 * dropped, and a mixed drop splits: the markdown becomes notes, the pictures
 * go into the one you're looking at. With no note open there is nowhere for an
 * image to go, and it says so.
 *
 * The drop is claimed either way, even when nothing in it can be used. A file
 * dropped onto a browser that isn't listening is a *navigation* — the page is
 * replaced by the file, and whatever was being typed goes with it. Catching it
 * and refusing it in a sentence is the difference between a refusal and an
 * accident.
 */
export function NoteImport() {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragKind, setDragKind] = useState<DragKind>("notes");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [, startTransition] = useTransition();

  // Whether an import is already in flight. A ref rather than the
  // transition's `pending`, because the window's drop handler is attached
  // once and reads this at drop time — state would have it reading whatever
  // was true when the listener was created.
  const busyRef = useRef(false);

  const runImport = useCallback(
    /**
     * `refused` carries files this component never tried to read — images
     * dropped with no note open, today. They travel with the import so one
     * drop produces one sentence rather than two notices arriving separately.
     */
    (files: File[], refused: SkippedFile[] = []) => {
      // A second drop while the first is still going would overwrite the
      // status of an import that hasn't finished. The toast on screen already
      // says one is in flight.
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
          // Sequentially, and in batches: Server Actions are dispatched one at
          // a time per client anyway, and the payload has a size limit the
          // batching respects (see [batchImportFiles]).
          for (const batch of batchImportFiles(accepted)) {
            created.push(...(await importNotes(batch)));
          }
          setStatus({ kind: "done", notes: created, skipped });

          // One file opens the note it made — that is the whole point of
          // dropping a single file. Several go to the index, which is the only
          // screen that can show you that they all landed.
          const first = created[0];
          const destination =
            created.length === 1 && first
              ? noteHref(first.slug)
              : ALL_NOTES_HREF;
          if (created.length === 0) return;
          if (destination === pathname) {
            // Already looking at where the notes went: a push to the current
            // URL is not guaranteed to re-render, and this view is now wrong.
            router.refresh();
          } else {
            router.push(destination);
          }
        } catch {
          // The action throws on a bad payload, and redirects to /login on an
          // expired session — which arrives here as a rejected promise too.
          setStatus({ kind: "failed" });
        } finally {
          busyRef.current = false;
        }
      });
    },
    [pathname, router],
  );

  // ⌘K's row. The click has to be synchronous inside the gesture that asked
  // for it, or the browser refuses to open the dialog.
  useEffect(() => subscribeNoteImport(() => inputRef.current?.click()), []);

  useEffect(() => {
    // Nested elements fire dragleave as the pointer crosses each boundary, so
    // "the drag has left the window" is a count reaching zero rather than any
    // single event.
    let depth = 0;

    // Only file drags. A drag of text inside the editor is CodeMirror's, and
    // preventing its default would break dropping a selection somewhere else
    // in the same note.
    function carriesFiles(event: DragEvent): boolean {
      return event.dataTransfer?.types.includes("Files") ?? false;
    }

    // What this drag would do if it were let go now. Mid-drag a browser will
    // name each item's type but not let anything read it, which is exactly
    // enough to tell a picture from a file: the overlay can then say where the
    // drop goes instead of guessing, and the guess is only ever wrong in the
    // harmless direction (an SVG says "images" here and is refused on drop).
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
      // Without this the browser refuses the drop and opens the file instead.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(event: DragEvent) {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    }

    function onDrop(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);

      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;

      // Split by what each file *is*, not by what the drop looked like: a drag
      // holding a screenshot and a `notes.md` does both things at once.
      const images = files.filter((file) => looksLikeImageType(file.type));
      const rest = files.filter((file) => !looksLikeImageType(file.type));
      const target = getImageTarget();

      if (images.length > 0 && target) {
        // Where the pointer let go, so the image lands in the paragraph it was
        // aimed at rather than wherever the caret was left.
        target(images, { x: event.clientX, y: event.clientY });
      }

      // With no note open an image has nowhere to go, and "only .md and .txt"
      // would be answering a question nobody asked.
      const homeless: SkippedFile[] = target
        ? []
        : images.map((file) => ({ name: file.name, reason: "no-note" }));

      if (rest.length > 0 || homeless.length > 0) runImport(rest, homeless);
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

  // The result clears itself; a failure doesn't, for the same reason the save
  // toast's doesn't — an import that didn't happen shouldn't tidy itself away
  // into looking like one that did.
  useEffect(() => {
    if (status.kind !== "done") return;
    const timer = setTimeout(() => setStatus({ kind: "idle" }), DONE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <>
      {/* Hidden rather than styled away: it is never tabbed to, never read out
          and only ever opened by [requestNoteImport]. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // Cleared so picking the same file twice in a row still fires.
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
 * What a drag in flight is about to do.
 *
 * Two states, and they are shaped differently on purpose.
 *
 * Files that would *become notes* replace what you're looking at, so the whole
 * window dims behind a card in the middle: the page underneath stops being the
 * subject the moment the drop is about making new ones.
 *
 * Images go *into the note on screen*, and that note is the thing being aimed
 * at — so nothing dims and nothing sits in the middle of the text. The hint
 * moves to the bottom edge, out of the way of the paragraph the pointer is
 * heading for.
 *
 * pointer-events-none on both: an element appearing under the pointer mid-drag
 * fires dragleave on whatever it was over, and the depth count would come
 * apart.
 */
function DropOverlay({ kind }: { kind: DragKind }) {
  // Dashed, and not glass. Every other floating surface in the app is a
  // finished thing you read or act on; this one is an outline around a space
  // waiting to be filled, which is what the dashes say and what the plus
  // repeats. No lift for the same reason — it isn't hovering over the page,
  // it's marking a place on it.
  const card =
    "bg-paper flex flex-col items-center rounded-[var(--radius-zone)] border-2 border-dashed border-[color-mix(in_srgb,var(--ink)_25%,transparent)] text-center";

  if (kind === "images") {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center px-6"
      >
        <div className={`${card} px-7 py-5`}>
          <PlusGlyph />
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
        <PlusGlyph />
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

/* The overlay's mark. Bare strokes rather than a plus in a circle: the dashed
   rim around it is already the enclosing shape, and two of them nested reads
   as a button you could press — which this is not, on a surface no pointer can
   reach. */
function PlusGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="size-7 text-ink-faint"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * What happened, bottom-right, in the same frame the save toast uses — there
 * is one place in this app where the interface talks back, and an import is
 * not a special enough event to invent a second.
 */
function ImportToast({
  status,
  onDismiss,
}: {
  status: Status;
  onDismiss: () => void;
}) {
  if (status.kind === "idle") return null;
  // A finished import with nothing to report is not a thing to put on screen.
  if (
    status.kind === "done" &&
    status.notes.length === 0 &&
    status.skipped.length === 0
  ) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex max-w-xs flex-col items-end gap-2 text-right">
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

/**
 * The headline: what landed, named when it's one thing.
 *
 * Null when nothing did, so a drop that produced no notes is reported by the
 * line that explains why rather than by "Nothing imported" standing above it
 * saying the same thing in fewer words.
 */
function importedLine(notes: ImportedNote[]): string | null {
  if (notes.length === 0) return null;
  if (notes.length === 1) return `Imported “${notes[0]!.title}”.`;
  return `Imported ${notes.length} notes.`;
}

/**
 * What didn't, grouped by why. Counts rather than a list of names: a folder
 * dropped whole is thirty refusals with one cause, and thirty filenames in a
 * toast is a wall nobody reads.
 */
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
