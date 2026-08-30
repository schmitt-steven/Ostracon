import type { ReactNode } from "react";

/**
 * One setting: name, control, and an optional explanatory note. Two layouts —
 * without a note the control shares the name's line; with one the name takes
 * its own line and the control drops to sit on the note's first line (and onto
 * its own line below ~288px of note).
 */
export function SettingRow({
  name,
  control,
  note,
}: {
  name: string;
  /** Pressed, chosen from, or followed — whatever changes this setting. */
  control: ReactNode;
  /** The quiet line under the name. Prose, and free to wrap. */
  note?: ReactNode;
}) {
  if (!note) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 text-[15px] leading-tight text-ink">{name}</p>
        {control}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[15px] leading-tight text-ink">{name}</p>

      {/* Note at the top of the row; control offset up (`-mt-1.5`) to sit on
          its first line rather than centred against the whole block. gap-y-3.5
          so a wrapped control still clears the note by 8px. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3.5">
        <div className="min-w-0 flex-1 basis-72">{note}</div>
        <div className="-mt-1.5 flex shrink-0 items-center">{control}</div>
      </div>
    </div>
  );
}
