"use client";

import { CheckIcon, ChevronDownIcon } from "@/icons";

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
 * A content header's sort, at the right end of the header row; the default is the
 * first mode listed. A bare trigger — no fill, no outline — with a chevron,
 * which is the one cue that it's a control and not a status line. Opens a
 * [ContextMenu] (not a native `<select>`, whose OS styling clashed over
 * glass). Modes are passed in because notes and images sort by different
 * things.
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
    // has to grow leftwards here, into the page, not off the content's edge.
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
        <ChevronDownIcon
          aria-hidden
          className="size-2.5 shrink-0 text-ink-faint transition-transform group-hover:text-ink-muted group-aria-expanded:rotate-180 group-aria-expanded:text-ink-muted"
        />
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
                    <CheckIcon className="size-3" />
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
