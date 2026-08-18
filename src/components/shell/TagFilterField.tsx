"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * The rail's "Filter tags" field — narrows the tag list in the rail and never
 * touches the notes.
 *
 * Currently mounted nowhere. It was the last of the three boxes on the screen
 * that looked like a search and wasn't quite one: sitting directly under the
 * ⌘K trigger, two field-shaped controls one above the other, the difference
 * between "find a tag in this list" and "find anything" was a distinction the
 * layout made no attempt to draw. The palette answers both — a tag typed into
 * it is offered as a destination, and `#` offers it as a scope.
 *
 * To bring it back, Rail needs its `query` state and the `matches` memo that
 * flattened the tree (a hit three levels down inside a collapsed parent is
 * still the thing you were looking for), the branch that renders `matches` in
 * place of pinned + tree, and:
 *
 *     <div className="mt-[var(--space-item)] px-1">
 *       <TagFilterField value={query} onChange={setQuery} />
 *     </div>
 */
export function TagFilterField({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // `/` from anywhere puts the caret here. Ignored while typing into something
  // else, and while a modifier is down, so it can't steal a slash mid-sentence.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, .cm-editor")
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
            inputRef.current?.blur();
          }
        }}
        placeholder="Filter tags"
        aria-label="Filter tags"
        spellCheck={false}
        className="w-full rounded-[var(--radius-control)] bg-field py-1.5 pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}
