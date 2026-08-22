"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** Announced as the menu's name — the row it was opened from. */
  label: string;
  /** Viewport coordinates of the click that opened it. */
  x: number;
  y: number;
  /**
   * Which corner `x` names. "end" hangs the menu's right edge there, for the
   * one caller that opens from a button instead of a pointer: a control parked
   * in the right end of a header wants its menu under itself, not running off
   * to the right of it.
   */
  align?: "start" | "end";
  /**
   * A trigger whose presses don't count as "outside". Without it a button that
   * toggles the menu can never close it: the press dismisses the menu, and then
   * its own click opens it straight back up.
   */
  ignoreRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * The panel a rail row's right-click opens: placed at the pointer, flipped
 * back inside the viewport, dismissed by Escape or by a press anywhere else.
 *
 * Shared by [TagMenu], [NoteMenu] and [SortControl] because they all say the
 * same thing — a short list of choices floating over the page — and a menu that
 * closed on Escape in one corner of the app and not another would be a
 * difference the user has no way to predict from looking. What differs between
 * them is only the items.
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

  // Flipped back inside the viewport once its real size is known — opening
  // near the bottom of a long rail otherwise puts half the menu off-screen.
  useEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const wanted = align === "end" ? x - box.width : x;
    setPlacement({
      left: Math.max(8, Math.min(wanted, window.innerWidth - box.width - 8)),
      top: Math.min(y, window.innerHeight - box.height - 8),
    });
  }, [x, y, align]);

  // Focus moves into the menu on open, so the keyboard has somewhere to be and
  // Escape lands here rather than on whatever is behind. An item marked
  // `data-autofocus` wins — a menu of choices should open on the one already
  // in force, not on the top of the list.
  useEffect(() => {
    const items = itemsOf(ref.current);
    (
      items.find((item) => item.dataset.autofocus !== undefined) ?? items[0]
    )?.focus();
  }, []);

  // Whatever had focus before gets it back, but only if the menu still had it
  // when it closed: a press somewhere else has already chosen a new home for
  // focus, and dragging it back to the trigger would undo that choice. A
  // focused item being unmounted drops focus to <body>, which is the tell.
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

      // Arrow keys walk the items, because this replaced a native <select> in
      // one place and a keyboard user shouldn't be able to tell which menu they
      // are in. Disabled items are skipped rather than stepped over silently —
      // they can't be chosen, so stopping on them is a dead press.
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const items = itemsOf(ref.current);
      if (items.length === 0) return;
      event.preventDefault();

      const step = event.key === "ArrowDown" ? 1 : -1;
      const here = items.indexOf(document.activeElement as HTMLButtonElement);
      // Wraps: four items in a corner of the screen, and hunting for the end of
      // a list that short is worse than looping past it. From outside the list
      // — focus lost to a press on the panel's padding — down opens at the top
      // and up at the bottom, the way the ends of a list are reached.
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

  // Into <body>, because `fixed` only means "to the viewport" while no ancestor
  // has claimed it: a scrolled [PaneScroller] header turns its backdrop-filter
  // on, which makes it the containing block for anything fixed inside it, and
  // the menu would jump by the height of the header the moment the page moved.
  // Coordinates are the viewport's here, so the panel has to be too.
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

/**
 * The rows the keyboard can land on, in the order they are drawn. Disabled ones
 * are left out by the selector rather than filtered after, so an all-disabled
 * menu simply has nowhere to go instead of trapping focus on a dead item.
 */
function itemsOf(root: HTMLElement | null) {
  return Array.from(
    root?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)',
    ) ?? [],
  );
}

/**
 * One row of any of the menus. Exported so they can't drift apart.
 *
 * Disabled goes to the faintest ink and stops taking the pointer, which also
 * takes away the hover tint — an item that lights up under the pointer and
 * then does nothing is the thing being disabled is meant to prevent. It stays
 * in the list rather than disappearing: "Move up" vanishing off the top row
 * would move every item below it, so the same press would land on a different
 * verb depending on which row the menu was opened from.
 */
export const menuItem =
  "row-tint w-full rounded-[var(--radius-control)] px-3 py-1.5 text-left text-[13px] text-ink-muted hover:text-ink disabled:pointer-events-none disabled:text-ink-faint";
