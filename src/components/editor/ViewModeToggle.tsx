"use client";

import { Segmented } from "@/components/ui/Segmented";
import { EyeIcon, PencilIcon } from "@/icons";

export type ViewMode = "write" | "split" | "preview";

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "write", label: "Edit" },
  { value: "preview", label: "Preview" },
  { value: "split", label: "Split" },
];

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

/**
 * The mode switch. Wide: a [Segmented] track (like the theme setting), kept
 * narrow so it costs the note header as little room as possible. Below
 * 1000px: a single button that swaps edit ⇄ preview, labelled with the side
 * you aren't on — Split is dropped (too narrow for two columns). Nothing here
 * is coloured — hue means "tag".
 */
export function ViewModeToggle({ mode, onChange }: Props) {
  const previewing = mode === "preview";

  return (
    <>
      <Segmented
        label="View mode"
        value={mode}
        options={VIEW_MODES}
        onChange={onChange}
        // h-7, matching the pin/delete buttons beside it.
        className="hidden h-7 min-[1000px]:grid"
        // Tight sides and a low floor: "Preview" is the widest label and it
        // sets the track, so the floor only has to keep "Edit" from pinching.
        segmentClassName="min-w-[52px] px-2"
      />

      {/* Touch only. No aria-label — the button's word is its name. */}
      <button
        type="button"
        onClick={() => onChange(previewing ? "write" : "preview")}
        className="row-tint flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-[13px] text-ink-muted min-[1000px]:hidden"
      >
        {previewing ? <PencilIcon aria-hidden className="size-3.5 shrink-0" /> : <EyeIcon aria-hidden className="size-3.5 shrink-0" />}
        {previewing ? "Edit" : "Preview"}
      </button>
    </>
  );
}
