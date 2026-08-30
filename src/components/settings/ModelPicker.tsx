"use client";

import { ChevronDownIcon } from "@/icons";

import { useRef, useState } from "react";
import { ContextMenu, menuItem } from "@/components/shell/ContextMenu";

/**
 * Which model a provider runs, chosen from the ones it says it has.
 *
 * The same construction [SortControl] uses — a bare trigger with a chevron
 * opening a [ContextMenu] — and for the same reason it was built that way
 * there: a native `<select>` here would be the one menu in the app drawn by the
 * operating system, in the system font, over glass. The list is short and
 * fixed at the moment of opening, so nothing is gained by the mismatch.
 *
 * **It is the settings page's button, drawn exactly like the settings page's
 * buttons.** `row-tint row-selected` at h-8 and px-3 — the same pale seat, to
 * the pixel, that Change, Download archive and Choose archive wear. They all
 * stand in one column down the right-hand edge of the page, and a second
 * finish anywhere in that column reads as a second kind of press rather than
 * as a difference worth noticing.
 *
 * It has been a well over sunk paper, which was wrong for exactly that reason:
 * a dark inset dent among four pale seats made settings' one dropdown look
 * like the only control on the page that came from somewhere else. Its being a
 * value rather than an action is a distinction the chevron already carries.
 *
 * **The list can be long.** Gemini answers with around sixteen chat models once
 * the image, audio and embedding lines are filtered out, and a menu of sixteen
 * rows is taller than the space under the trigger on a laptop. It scrolls
 * inside itself rather than being truncated or paged: [ContextMenu] measures
 * the panel to flip it back inside the viewport, so a panel that has already
 * capped its own height is one it can always place.
 */
export function ModelPicker({
  label,
  value,
  models,
  disabled,
  onChange,
}: {
  /** What is being chosen for — "Model for Gemini", spoken to the menu. */
  label: string;
  value: string;
  models: string[];
  disabled?: boolean;
  /**
   * Fired for every pick, including one that names the model already in force.
   *
   * That case is not the no-op it looks like. A rejected choice leaves the
   * trigger showing the model still in force and an explanation next to it
   * naming the one to pick instead — and when the reader follows that advice,
   * the model they are told to pick can be the one already there. Swallowing
   * that press would leave its own error on screen with no way to clear it. The
   * caller decides what an unchanged pick is worth; the picker only reports it.
   */
  onChange: (model: string) => void;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Measured at open rather than tracked: settings is one long scroll, but the
  // menu closes on any press outside itself, so it cannot outlive the position
  // it was placed at.
  function open() {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    // Right edges flush, hanging just below — the trigger sits at the right
    // end of its row, so the panel has to grow leftwards into the page.
    setAnchor({ x: box.right, y: box.bottom + 4 });
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={() => (anchor ? setAnchor(null) : open())}
        // max-w so a long local model id (`hf.co/user/repo:Q4_K_M`) can't push
        // the row wider than the section; the name truncates and the whole of
        // it is in the menu underneath.
        className="row-tint row-selected flex h-8 max-w-[min(280px,60%)] items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[13px] text-ink disabled:opacity-50"
      >
        <span className="truncate font-mono">{value}</span>
        {/* The one mark that says this is a control rather than a value. */}
        <ChevronDownIcon aria-hidden className="size-3 shrink-0 text-ink-faint" />
      </button>

      {anchor && (
        <ContextMenu
          label={label}
          x={anchor.x}
          y={anchor.y}
          align="end"
          ignoreRef={trigger}
          onClose={() => setAnchor(null)}
        >
          <div className="max-h-[min(50vh,320px)] overflow-y-auto">
            {models.map((model) => (
              <button
                key={model}
                type="button"
                role="menuitemradio"
                aria-checked={model === value}
                // The menu opens on the model already in force rather than at
                // the top of a list of sixteen — see [ContextMenu]'s focus
                // handling, which looks for exactly this.
                data-autofocus={model === value ? "" : undefined}
                onClick={() => {
                  setAnchor(null);
                  onChange(model);
                }}
                className={`${menuItem} font-mono break-all ${
                  model === value ? "text-ink" : ""
                }`}
              >
                {model}
              </button>
            ))}
          </div>
        </ContextMenu>
      )}
    </>
  );
}
