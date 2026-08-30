"use client";

import { SearchIcon } from "@/icons";

import { setPaletteOpen } from "@/lib/command/palette-state";

/**
 * The magnifier that sits at the right-hand end of an overview's heading row.
 *
 * It opens the palette, exactly as ⌘K and the rail's [SearchTrigger] do —
 * there is one search in this app and this is another door into it, not a
 * second field. It was a tag index's control first, on the argument that a tag
 * page is where "find something in here" occurs; the same is true of any list
 * you are standing in front of, so All notes, Untagged and All tags carry it
 * too. The palette reads the route it was opened from and narrows itself
 * accordingly, so the button doesn't have to say what it will search — only
 * what you are looking at.
 *
 * The 28px circle is the note header's control, unchanged, so a header control
 * is the same object wherever it appears. `label` is what a screen reader
 * hears; `hint` is the tooltip a pointer gets, and the two differ because the
 * first has to name the target and the second can say what will happen.
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
