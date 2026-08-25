"use client";

import { useRef, useState } from "react";
import { ContextMenu, menuItem } from "@/components/shell/ContextMenu";

type Props<M extends string> = {
  value: M;
  /** The choices, in the order they should read. */
  modes: readonly M[];
  labels: Record<M, string>;
  /** What is being sorted — "Sort notes", "Sort images". */
  label: string;
  onChange: (mode: M) => void;
};

/**
 * A pane header's sort. Every view that has one puts it at the right end of the
 * header row, and the default is always the first mode listed — which is also
 * why there's no separate "Recent" section anywhere: the default view of
 * everything, sorted this way, already *is* that section.
 *
 * A bare trigger with no chrome — no fill, no outline. It sits at the right end
 * of a header that has no border under it, and a drawn control there would be
 * the loudest thing on screen for something read once a week.
 *
 * The chevron is the one mark it does get, and it is not decoration: without
 * it, "Recently edited" sitting alone in the corner reads as a status line
 * describing the list rather than as a control that changes it. Everything else
 * here is revealed on reach; this has to be legible before anyone reaches for
 * it, because nothing else on the screen says the sort can be changed at all.
 *
 * What drops out of it is [ContextMenu] — the same panel the rail rows open on
 * right-click. It used to be a native `<select>`, which meant the one menu the
 * app opens by itself was the one menu drawn by the OS: system font, system
 * corners, an opaque white slab over glass. The list is a handful of fixed
 * choices, so nothing was gained for the mismatch.
 *
 * The modes are handed in rather than fixed here because the two lists sort by
 * different things — notes by when they were edited and how long they are,
 * images by when they were added and how big they are. What both views want is
 * the same object in the same corner behaving the same way, which is all this
 * file is.
 */
export function SortControl<M extends string>({
  value,
  modes,
  labels,
  label,
  onChange,
}: Props<M>) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Measured at open rather than tracked: the header is sticky, so the button
  // is where it was for as long as the menu is up.
  function open() {
    const box = triggerRef.current?.getBoundingClientRect();
    if (!box) return;
    // Right edges flush, hanging a hair below — a menu wider than its trigger
    // has to grow leftwards here, into the page, not off the pane's edge.
    setAnchor({ x: box.right, y: box.bottom + 6 });
  }

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={() => (anchor ? setAnchor(null) : open())}
        onKeyDown={(event) => {
          // Down opens it, as it did when this was a select — the one key
          // anybody tries on a closed menu.
          if (event.key === "ArrowDown" && !anchor) {
            event.preventDefault();
            open();
          }
        }}
        // Text left-aligned because the chevron leads it: the mark stays put
        // while the labels change length behind it, so the one fixed thing in
        // the corner is the part that says this is a control.
        className="row-tint group flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 text-left text-[13px] text-ink-muted outline-none hover:text-ink aria-expanded:text-ink"
      >
        {/* A sibling of the label, not a background image: it has to inherit
            the trigger's colour so both halves lighten together on hover, and
            a background-image can't be told what currentColor is. */}
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="size-2.5 shrink-0 text-ink-faint transition-transform group-hover:text-ink-muted group-aria-expanded:rotate-180 group-aria-expanded:text-ink-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
        </svg>
        {labels[value]}
      </button>

      {anchor && (
        <ContextMenu
          label={label}
          x={anchor.x}
          y={anchor.y}
          align="end"
          ignoreRef={triggerRef}
          onClose={() => setAnchor(null)}
        >
          {modes.map((mode) => {
            const chosen = mode === value;
            return (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                // Opens on the sort already in force, so a menu raised to read
                // the current one answers without a press.
                data-autofocus={chosen ? "" : undefined}
                className={`${menuItem} flex items-center gap-2 aria-checked:text-ink`}
                onClick={() => {
                  onChange(mode);
                  setAnchor(null);
                }}
              >
                {/* The tick's slot is held open whether or not it's drawn:
                    labels that shifted sideways as the choice moved would make
                    the list look like it re-sorted itself. */}
                <span aria-hidden className="size-3 shrink-0">
                  {chosen && (
                    <svg
                      viewBox="0 0 12 12"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m2 6.5 2.75 2.75L10 3.5" />
                    </svg>
                  )}
                </span>
                {labels[mode]}
              </button>
            );
          })}
        </ContextMenu>
      )}
    </div>
  );
}
