"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** Announced as the menu's name — the row it was opened from. */
  label: string;
  /** Viewport coordinates of the click that opened it. */
  x: number;
  y: number;
  /** Which corner `x` names — "end" hangs the right edge there, for a
   * button-opened menu. */
  align?: "start" | "end";
  /** A trigger whose presses don't count as "outside", so a toggle button can
   * close the menu it opened. */
  ignoreRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * A menu panel at the pointer, flipped inside the viewport, dismissed by
 * Escape or an outside press. Shared by [TagMenu], [NoteMenu] and
 * [SortControl] so they behave alike; only the items differ.
 */
export function ContextMenu({
  label,
  x,
  y,
  align = "start",
  ignoreRef,
  onClose,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  // Flipped inside the viewport once its real size is known.
  useEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const wanted = align === "end" ? x - box.width : x;
    setPlacement({
      left: Math.max(8, Math.min(wanted, window.innerWidth - box.width - 8)),
      top: Math.min(y, window.innerHeight - box.height - 8),
    });
  }, [x, y, align]);

  // Focus into the menu on open; `data-autofocus` (the in-force choice) wins
  // over the first item.
  useEffect(() => {
    const items = itemsOf(ref.current);
    (
      items.find((item) => item.dataset.autofocus !== undefined) ?? items[0]
    )?.focus();
  }, []);

  // Restore focus to the opener, but only if focus fell to <body> (i.e. the
  // menu still had it) — an outside press already chose a new home.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (!document.activeElement || document.activeElement === document.body) {
        opener?.focus();
      }
    };
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (ignoreRef?.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      // Arrow keys walk the items (this replaced a native <select>). Disabled
      // items are excluded by the selector, not stepped over.
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const items = itemsOf(ref.current);
      if (items.length === 0) return;
      event.preventDefault();

      const step = event.key === "ArrowDown" ? 1 : -1;
      const here = items.indexOf(document.activeElement as HTMLButtonElement);
      // Wraps; from outside the list, down opens at the top and up at the bottom.
      const next =
        here === -1
          ? step === 1
            ? 0
            : items.length - 1
          : (here + step + items.length) % items.length;
      items[next]?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, ignoreRef]);

  // Into <body> — a scrolled [PaneScroller] header's backdrop-filter would
  // otherwise become the containing block for this `fixed` panel.
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={{ left: placement.left, top: placement.top }}
      className="glass lift-2 fixed z-50 w-52 rounded-[var(--radius-zone)] p-1.5"
    >
      {children}
    </div>,
    document.body,
  );
}

/** The keyboard-reachable rows, in draw order — disabled ones excluded by the
 * selector. */
function itemsOf(root: HTMLElement | null) {
  return Array.from(
    root?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)',
    ) ?? [],
  );
}

/** One menu row's classes, exported so the menus can't drift. Disabled stays
 * in the list (so verbs don't shift) but goes faint and inert. */
export const menuItem =
  "row-tint w-full rounded-[var(--radius-control)] px-3 py-1.5 text-left text-[13px] text-ink-muted hover:text-ink disabled:pointer-events-none disabled:text-ink-faint";
