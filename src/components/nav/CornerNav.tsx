"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Replaces the old full-width header. A quarter disc pinned to the top-right
 * corner, holding the two things that header carried: the mark (home) and
 * Log out.
 *
 * It stays collapsed at 4rem — small enough that page content starting at
 * `pt-16` clears it at every viewport width, so it needs no mobile variant —
 * and grows to 13rem to reveal the theme switch and Log out. Hover opens it on
 * pointer devices, tapping the disc opens it on touch, and focus opens it for
 * the keyboard.
 */
export function CornerNav() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Touch has no pointerleave to close on, so the next tap anywhere else does
  // it. Only listened for while open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      // `data-open` is the touch/keyboard path; `hover` covers the mouse. Both
      // drive the same classes below, so the disc has one open appearance
      // however it got there.
      data-open={open || undefined}
      onPointerLeave={() => setOpen(false)}
      className="group fixed right-0 top-0 z-30"
    >
      <div
        className={[
          // A square with only its bottom-left corner rounded to the full side
          // length is exactly a quarter disc centred on the page corner.
          "size-16 rounded-bl-full border border-line bg-surface/90 shadow-lg shadow-shade/5 backdrop-blur-md",
          "transition-[width,height] duration-300 ease-out motion-reduce:transition-none",
          "group-hover:size-52 group-focus-within:size-52 group-data-open:size-52",
        ].join(" ")}
      />

      {/* Fills the disc so any part of it toggles — the dot below sits on top
          of this and keeps its own click. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="absolute right-0 top-0 size-16 rounded-bl-full transition-[width,height] duration-300 ease-out group-hover:size-52 group-focus-within:size-52 group-data-open:size-52 motion-reduce:transition-none"
      />

      {/* The mark. Anchored rather than centred in the disc, so it holds still
          while the disc grows behind it. */}
      <Link
        href="/"
        aria-label="All notes"
        className="absolute right-5 top-5 flex size-3 items-center justify-center rounded-full bg-accent transition-transform hover:scale-125"
      />

      {/* Both controls ride one reveal, right-aligned: the disc's edge curves
          away to the left as it descends, so a right-hand stack is the shape
          that stays inside it. Log out sits last — the one action here you
          can't undo by clicking again. */}
      <div
        className={[
          "absolute right-4 top-14 flex flex-col items-end gap-0.5 opacity-0 transition-opacity duration-200",
          "pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto group-data-open:pointer-events-auto",
          "group-hover:opacity-100 group-focus-within:opacity-100 group-data-open:opacity-100",
          "motion-reduce:transition-none",
        ].join(" ")}
      >
        <ThemeToggle />
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-full px-3 py-1.5 text-base text-ink-muted transition-colors hover:bg-blue-wash hover:text-blue"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
