"use client";

import { ChevronDownIcon } from "@/icons";

import { useRef, useState } from "react";
import { ContextMenu, menuItem } from "@/components/shell/ContextMenu";

/**
 * Which model a provider runs. A chevron trigger opening a [ContextMenu], like
 * [SortControl] — not a native `<select>`. Drawn as the settings page's other
 * right-column buttons (`row-tint row-selected`). The list can run to ~16
 * models, so the menu scrolls inside its own capped height.
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
   * Fired for every pick, including one naming the current model — after a
   * rejected choice, re-picking the model in force is how the reader clears
   * the error. The caller decides what an unchanged pick means.
   */
  onChange: (model: string) => void;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Measured at open, not tracked — the menu closes on any outside press.
  function open() {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    // Right edges flush, hanging below — the trigger is at the row's right end.
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
        // max-w so a long local model id can't push the row past the section;
        // it truncates here and shows in full in the menu.
        className="row-tint row-selected flex h-8 max-w-[min(280px,60%)] items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[13px] text-ink disabled:opacity-50"
      >
        <span className="truncate font-mono">{value}</span>
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
                // Menu opens focused on the current model — see [ContextMenu].
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
