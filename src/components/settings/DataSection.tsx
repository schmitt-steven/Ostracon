import { Suspense } from "react";
import { archiveContents } from "@/lib/data/export";
import { ImportSetting } from "./ImportSetting";
import { SettingRow } from "./SettingRow";

/**
 * Data — the collection as files, out and back in. Export writes a zip of
 * Markdown and images; Import reads one back. The archive holds notes and
 * images only — no password, sessions or keys — which the section says on the
 * page. A server component slot; [archiveContents] reads the whole collection.
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
 * Export's row. The control is an anchor to `/api/data/export`, not a button —
 * the browser owns the download, so this app never holds the archive in
 * memory. Styled like the Password row's seated control.
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

/** What the download would contain, counted — and what it leaves out. */
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
