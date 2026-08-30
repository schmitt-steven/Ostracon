"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ARCHIVE_ACCEPT, isArchiveFile } from "@/lib/data/import-rules";
import { readArchive, type ArchiveReading } from "@/lib/data/read-archive";
import {
  runArchiveImport,
  type ImportOutcome,
  type ImportProgress,
} from "@/lib/data/run-import";
import { SettingRow } from "./SettingRow";

/**
 * Data's second row: an archive, read back in.
 *
 * **It asks before it writes, and that is the point of the row.** Picking a
 * file only opens it — in this tab, where nothing has been sent anywhere yet —
 * and what appears is what was found: how many notes, how many images, when the
 * archive was made. The import happens on a second press. An import is one of
 * the few things in this app that cannot be undone with ⌘Z, so it is the one
 * place where a confirmation is worth the extra press.
 *
 * **Everything it adds is new.** No note is replaced, no image is overwritten,
 * nothing already here is touched: a title that already exists gets a second
 * note beside the first, exactly as it would if you had typed it. That is the
 * whole safety model of this control, and it is what the summary line promises
 * before you commit to anything.
 *
 * **Loose Markdown files are somebody else's job.** They can be dropped
 * anywhere on the window and always could — see [NoteImport], which is mounted
 * in the shell and owns every file drop in the app. This row takes a `.zip`,
 * because an archive is the thing you cannot do by dragging.
 */

type Stage =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "ready"; reading: ArchiveReading }
  | { kind: "working"; progress: ImportProgress }
  | { kind: "done"; outcome: ImportOutcome }
  | { kind: "refused"; reason: string };

export function ImportSetting() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [, startTransition] = useTransition();

  async function choose(file: File) {
    if (!isArchiveFile(file.name)) {
      setStage({ kind: "refused", reason: "That isn't a .zip archive." });
      return;
    }
    setStage({ kind: "reading" });
    try {
      const reading = await readArchive(file);
      if (reading.refusal) {
        setStage({ kind: "refused", reason: reading.refusal });
        return;
      }
      setStage({ kind: "ready", reading });
    } catch {
      setStage({ kind: "refused", reason: "That archive couldn't be opened." });
    }
  }

  function start(reading: ArchiveReading) {
    setStage({
      kind: "working",
      progress: { phase: "images", done: 0, total: reading.images.length },
    });
    startTransition(async () => {
      const outcome = await runArchiveImport(reading, (progress) =>
        setStage({ kind: "working", progress }),
      );
      setStage({ kind: "done", outcome });
      // The collection under this page has changed — the rail's counts, the
      // index, every tag. The action revalidated the tree on the server; this
      // is what makes the browser go and collect it.
      router.refresh();
    });
  }

  const busy = stage.kind === "reading" || stage.kind === "working";

  return (
    <>
      <SettingRow
        name="Import"
        note={<Report stage={stage} onImport={start} />}
        control={
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="row-tint row-selected flex h-8 shrink-0 items-center rounded-[var(--radius-control)] px-3 text-[13px] text-ink disabled:opacity-50"
          >
            Choose archive
          </button>
        }
      />

      {/* Hidden rather than styled away: never tabbed to, never read out, and
          only ever opened by the button beside it. */}
      <input
        ref={inputRef}
        type="file"
        accept={ARCHIVE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice in a row still fires.
          event.target.value = "";
          if (file) void choose(file);
        }}
      />
    </>
  );
}

/**
 * The line under the row, in every state it has.
 *
 * One place rather than a notice per outcome, for the reason the row above has
 * one control: this is a settings row, and a settings row says one thing at a
 * time about itself.
 */
function Report({
  stage,
  onImport,
}: {
  stage: Stage;
  onImport: (reading: ArchiveReading) => void;
}) {
  if (stage.kind === "idle") {
    return (
      <p className="text-[13px] text-ink-faint">
        A .zip exported from here, or any folder of Markdown files zipped up.
        Everything in it is added; nothing already here is replaced.
      </p>
    );
  }

  if (stage.kind === "reading") {
    return <p className="text-[13px] text-ink-faint">Opening the archive…</p>;
  }

  if (stage.kind === "refused") {
    return <p className="text-[13px] text-danger">{stage.reason}</p>;
  }

  if (stage.kind === "ready") {
    const { reading } = stage;
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[13px] text-ink-faint">
          {describe(reading)} Nothing is written until you say so.
        </p>
        <button
          type="button"
          onClick={() => onImport(reading)}
          className="row-tint row-selected flex h-7 shrink-0 items-center rounded-[var(--radius-control)] px-2.5 text-[13px] text-ink"
        >
          Import
        </button>
      </div>
    );
  }

  if (stage.kind === "working") {
    return (
      <p role="status" className="text-[13px] text-ink-faint">
        {progressLine(stage.progress)}
      </p>
    );
  }

  return (
    <p role="status" className="text-[13px] text-ink-faint">
      {outcomeLine(stage.outcome)}
    </p>
  );
}

/**
 * What is in the archive, and — when it says — when it was made.
 *
 * The skipped count is a second sentence rather than a clause, because it is a
 * different kind of fact: the first says what you are about to get, the second
 * says what you are not. A zipped Obsidian vault brings `.canvas` files and an
 * `.obsidian/` folder along with the notes, and finding out afterwards that a
 * third of the archive didn't arrive is how a working import comes to look
 * broken.
 */
function describe(reading: ArchiveReading): string {
  const parts = [count(reading.notes.length, "note")];
  if (reading.images.length > 0) {
    parts.push(count(reading.images.length, "image"));
  }
  let line = parts.join(" and ");

  const when = reading.exportedAt ? new Date(reading.exportedAt) : null;
  if (when && !Number.isNaN(when.getTime())) {
    line += `, exported ${when.toLocaleDateString(undefined, { dateStyle: "medium" })}`;
  }
  line += ".";

  if (reading.ignored > 0) {
    line += ` ${count(reading.ignored, "other file")} will be skipped — only Markdown and images are imported.`;
  }
  return line;
}

function progressLine(progress: ImportProgress): string {
  if (progress.phase === "finishing") return "Rebuilding links…";
  const noun = progress.phase === "images" ? "image" : "note";
  return `Importing ${noun}s — ${progress.done} of ${progress.total}…`;
}

/**
 * What landed. The failures are a second clause rather than a second line: an
 * import that mostly worked is one sentence about a thing that mostly worked.
 */
function outcomeLine(outcome: ImportOutcome): string {
  const clauses = [`Imported ${count(outcome.notes, "note")}`];
  if (outcome.images > 0) clauses.push(`${count(outcome.images, "image")}`);
  let line = `${clauses.join(" and ")}.`;
  if (outcome.failedImages > 0) {
    line += ` ${count(outcome.failedImages, "image")} wouldn't upload.`;
  }
  if (outcome.error) line += ` ${outcome.error}`;
  return line;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
