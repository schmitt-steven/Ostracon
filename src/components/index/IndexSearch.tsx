"use client";

import { useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Fired the first time the field is touched, to start the corpus fetch. */
  onArm: () => void;
  /** What this index is called, so the placeholder says what it will search. */
  scope: string;
  /** Whether this view has a tag hue to sit on — tints the field to match
   *  instead of the flat neutral ground. */
  tinted: boolean;
};

/**
 * The index's own search field: title, body and tags, across the notes this
 * view is already showing and nothing else.
 *
 * Currently mounted nowhere — kept against the day the palette's scope chip
 * turns out not to cover this. ⌘K now opens pre-scoped to the tag the index
 * is showing, which is the same search this field ran, so a screen that had
 * three search affordances on it has one. To bring it back, IndexView needs
 * its `query` state and the `matched` memo that intersected the app-wide
 * index with `liveNotes` again (see git history), plus:
 *
 *     <div className="-mx-3 mt-[var(--space-block)]">
 *       <IndexSearch value={query} onChange={…} onArm={arm}
 *                    scope={title} tinted={hue !== undefined} />
 *     </div>
 *
 * Deliberately not the same thing as ⌘K. The palette is the app-wide jump —
 * every note, plus the verbs — and that mixture is exactly what makes it the
 * wrong tool for narrowing the list in front of you. This one only ever
 * subtracts rows from the list below it, so what you get back is still the
 * #infra index, just shorter.
 *
 * Styled as the rail's tag filter is: same tonal ground, same bare magnifier.
 * The tone matters more here than it does there — this field sits in the gap
 * between the title block and the list, and without a box of its own at rest
 * it read as adrift between the two rather than as the thing that narrows the
 * list below it.
 */
export function IndexSearch({ value, onChange, onArm, scope, tinted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

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
        type="search"
        value={value}
        // The corpus is fetched on first contact rather than on mount: an
        // index you only ever read costs nothing, and by the time the first
        // keystroke lands the fetch is usually already back.
        onFocus={onArm}
        onChange={(event) => {
          onArm();
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onChange("");
            inputRef.current?.blur();
          }
        }}
        placeholder={`Search ${scope}`}
        aria-label={`Search ${scope} by title, text and tags`}
        spellCheck={false}
        className={`w-full rounded-[var(--radius-control)] py-1.5 pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-faint ${
          tinted ? "hue-field" : "bg-field"
        }`}
      />
    </div>
  );
}
