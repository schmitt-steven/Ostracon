"use client";

import { setPaletteOpen } from "@/lib/command/palette-state";

/**
 * The `⌘K` hint that used to sit at the right end of every view's header.
 *
 * Currently mounted nowhere. It was a button, but at 13px of bare mono next
 * to the sort control it read as a keyboard hint *for the sort control* —
 * a label, not a target. shell/SearchTrigger replaced it: same job, in the
 * rail, drawn as the search box it opens. This one is kept for the case where
 * a view without a rail needs a header-sized way in again.
 *
 * A button, not decoration — the shortcut is the label, so a reader who
 * doesn't know the convention can still click it and find out. Mono, because
 * that's what mono is reserved for here: keyboard shortcuts and nothing else.
 */
export function PaletteHint() {
  return (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      aria-label="Open the command palette"
      className="row-tint shrink-0 rounded-[var(--radius-control)] px-2 py-1 font-mono text-[13px] text-ink-faint hover:text-ink-muted max-[999px]:hidden"
    >
      ⌘K
    </button>
  );
}
