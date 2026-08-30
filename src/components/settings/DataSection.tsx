import { Suspense } from "react";
import { archiveContents } from "@/lib/data/export";
import { ImportSetting } from "./ImportSetting";
import { SettingRow } from "./SettingRow";

/**
 * Data — the collection as files, out and back in.
 *
 * Two rows, and they are one round trip. Export writes a zip of Markdown and
 * images; Import reads one back. The order is the order you would do them in,
 * and it is also the order of risk: the first row cannot change anything and
 * the second one can only add.
 *
 * **What is in the archive is notes and images, and the section says so.** Not
 * the password, not the sessions, not any AI key —
 * a backup is a file people mail to themselves, and a backup that is also a
 * credential is a mistake you only get to make once. That is a design decision
 * rather than an omission, so it is written on the page rather than only in the
 * code.
 *
 * A server component handed to [SettingsView] as a slot, like its neighbours,
 * though for a milder reason than theirs: nothing here is secret, but counting
 * what the archive would hold means reading every note, and [archiveContents]
 * is `server-only` because the thing it reads is the whole collection.
 */
export function DataSection() {
  return (
    <div className="flex flex-col gap-4">
      <ExportSetting />
      <ImportSetting />
    </div>
  );
}

/**
 * Export's row.
 *
 * The control is an anchor, not a button, and that is the feature. A link to
 * `/api/data/export` hands the download to the browser — its own progress row,
 * its own Downloads folder, its own resume — for a file this app never has to
 * hold in memory. A button posting an action would have to buffer the archive
 * in a tab and hand it back through a blob URL, which is the same download
 * done worse and with a ceiling.
 *
 * Styled as the seated control the Password row uses, because it sits in the
 * same column and does the same kind of job. `download` is there for the
 * filename; the response sets one too, which is what actually decides it.
 */
function ExportSetting() {
  return (
    <SettingRow
      name="Export"
      note={
        <Suspense fallback={<NoteSkeleton />}>
          <ExportNote />
        </Suspense>
      }
      control={
        <a
          href="/api/data/export"
          download
          className="row-tint row-selected flex h-8 shrink-0 items-center rounded-[var(--radius-control)] px-3 text-[13px] text-ink"
        >
          Download archive
        </a>
      }
    />
  );
}

/**
 * What the download would contain, counted rather than estimated.
 *
 * Two sentences and they answer different questions. The first is how big the
 * thing you are about to ask for is. The second is what it deliberately
 * leaves out, which is the sentence that matters when the file ends up in a
 * mail thread.
 */
async function ExportNote() {
  const { notes, images } = await archiveContents();

  return (
    <p className="text-[13px] text-ink-faint">
      {count(notes, "note")} and {count(images, "image")}, as Markdown files in
      a .zip. No password, sessions or API keys — only what you wrote.
    </p>
  );
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The same line with nothing in it yet — one line tall, so nothing shifts. */
function NoteSkeleton() {
  return (
    <p aria-hidden className="text-[13px] text-ink-faint">
      —
    </p>
  );
}
