"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Backlink } from "@/lib/notes/queries";
import { noteHref } from "@/lib/tags/routes";
import { DROPDOWN, GROUP_LABEL } from "./TagBar";

/** "N backlinks" in the note's info line, opening a list of the notes that link here. */
export function BacklinksMenu({ backlinks }: { backlinks: Backlink[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Arrow keys move real focus, so Enter follows the link natively.
  function moveFocus(step: 1 | -1) {
    const rows = Array.from(listRef.current?.querySelectorAll("a") ?? []);
    if (rows.length === 0) return;
    const current = rows.indexOf(document.activeElement as HTMLAnchorElement);
    const next =
      current === -1
        ? step === 1
          ? 0
          : rows.length - 1
        : (current + step + rows.length) % rows.length;
    rows[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      if (open) moveFocus(step);
      else {
        setOpen(true);
        // The list mounts on this render; focus it on the next frame.
        requestAnimationFrame(() => moveFocus(step));
      }
    }
  }

  return (
    <span ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="underline decoration-ink-faint decoration-1 underline-offset-[3px] hover:text-ink hover:decoration-current"
      >
        {backlinks.length} {backlinks.length === 1 ? "backlink" : "backlinks"}
      </button>

      {open && (
        <ul ref={listRef} aria-label="Notes that link here" className={DROPDOWN}>
          <li aria-hidden className={GROUP_LABEL}>
            Referenced by
          </li>
          {backlinks.map((backlink) => (
            <li key={backlink.slug}>
              <Link
                // No `from` — a link between notes leaves the index behind.
                href={noteHref(backlink.slug)}
                onClick={() => setOpen(false)}
                title={backlink.title || "Untitled"}
                // The row tint is the focus mark; `!` beats the unlayered rule.
                className="row-tint block truncate rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink focus-visible:outline-none!"
              >
                {backlink.title || "Untitled"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
