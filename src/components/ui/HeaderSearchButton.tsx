"use client";

import { SearchIcon } from "@/icons";

import { setPaletteOpen } from "@/lib/command/palette-state";

/**
 * The magnifier at the right end of an overview's heading row — opens the
 * palette, like ⌘K and [SearchTrigger]. The palette reads the route and
 * narrows itself. `label` names the target for a screen reader; `hint` is the
 * pointer tooltip.
 */
export function HeaderSearchButton({
  label,
  hint,
}: {
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      aria-label={label}
      aria-keyshortcuts="Meta+K Control+K"
      title={hint}
      className="row-tint flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:text-ink"
    >
      <SearchIcon aria-hidden className="size-4" />
    </button>
  );
}
