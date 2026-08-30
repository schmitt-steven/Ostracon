"use client";

import { CloseSmallIcon } from "@/icons";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTagHues } from "@/hooks/use-tag-hues";
import { isValidTag, normalizeTag } from "@/lib/tags/parse";
import { tagHref } from "@/lib/tags/routes";

type Props = {
  /** The note's tags, in order. The first is its primary one. */
  tags: string[];
  /** Every tag in the collection, for the completion list. */
  allTags: string[];
  onChange: (tags: string[]) => void;
  /** Candidate tags for this note's text — called when the field opens, not
   * per keystroke (the heuristic reads the whole note). */
  onSuggest: () => string[];
};

/** How many completions the list shows at once. */
const OPTION_LIMIT = 8;

/** Row item height — on the items, not the row, so it holds per line once tags
 * wrap and the row doesn't jump when `+ tag` opens. */
const ROW_ITEM = "flex h-7 items-center";

/** How long a touch has to be held before it means "remove this". */
const LONG_PRESS_MS = 450;

// Capped width — a deeply nested name would otherwise throw the list across
// the window.
const DROPDOWN =
  "glass lift-2 absolute top-full left-0 z-30 mt-1.5 max-h-72 w-max max-w-[min(20rem,calc(100vw-3rem))] overflow-y-auto rounded-[var(--radius-zone)] p-1.5";

const DROPDOWN_ROW =
  "hue-row block w-full truncate rounded-[var(--radius-control)] px-3 py-1.5 text-left text-[13px] text-ink";

const GROUP_LABEL = "px-3 pt-1.5 pb-1 text-[11px] text-ink-faint";

/** One row of the completion list. */
type Option = { tag: string; suggested: boolean };

/**
 * The note's tags, above the body — the one place a note is filed (filing
 * isn't part of what a note says, so it's not in the prose). At rest: tag
 * names and one muted `+ tag`; everything else is revealed on reach.
 */
export function TagBar({ tags, allTags, onChange, onSuggest }: Props) {
  const { hueOf } = useTagHues();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // null while the field is closed; the pending name (initially "") once it's
  // open. Opening is also what asks for suggestions.
  const [draft, setDraft] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Which row the arrow keys are on; -1 = none (Enter commits what was typed).
  const [highlighted, setHighlighted] = useState(-1);
  // The tag whose remove control a long-press pinned open (the touch way in).
  const [pinned, setPinned] = useState<string | null>(null);

  const typed = normalizeTag((draft ?? "").trim().replace(/^#/, ""));

  function open() {
    const taken = new Set(tags);
    setSuggestions(onSuggest().filter((tag) => !taken.has(tag)));
    setPinned(null);
    setHighlighted(-1);
    setDraft("");
  }

  // The completion list: suggestions for this note first, then everything
  // else — one control, no separate "suggest" button.
  const options = useMemo<Option[]>(() => {
    if (draft === null) return [];
    const taken = new Set(tags);
    const matches = (tag: string) => typed === "" || tag.includes(typed);

    const suggested = suggestions.filter(
      (tag) => !taken.has(tag) && matches(tag),
    );
    const shown = new Set(suggested);
    const rest = allTags
      .filter((tag) => !taken.has(tag) && !shown.has(tag) && matches(tag))
      // Prefix matches first, then substring matches.
      .sort(
        (a, b) =>
          Number(b.startsWith(typed)) - Number(a.startsWith(typed)) ||
          a.localeCompare(b),
      );

    return [
      ...suggested.map((tag) => ({ tag, suggested: true })),
      ...rest.map((tag) => ({ tag, suggested: false })),
    ].slice(0, OPTION_LIMIT);
  }, [allTags, draft, suggestions, tags, typed]);

  /** Whether committing `typed` would coin a tag that doesn't exist yet. */
  const isNew = typed !== "" && !allTags.includes(typed);
  const suggestedCount = options.filter((option) => option.suggested).length;

  function add(name: string) {
    const tag = normalizeTag(name.trim().replace(/^#/, ""));
    if (tag && isValidTag(tag) && !tags.includes(tag)) onChange([...tags, tag]);
    // Stay open — tagging is usually more than one tag.
    setDraft("");
    setHighlighted(-1);
    inputRef.current?.focus();
  }

  function close() {
    setDraft(null);
    setHighlighted(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = options[highlighted];
      if (picked) add(picked.tag);
      else if (typed) add(typed);
      else close();
    } else if (event.key === "Escape") {
      event.preventDefault();
      // "stop tagging", not "leave the note" — stop the editor's Escape handler.
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => (i + 1 >= options.length ? -1 : i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => (i <= -1 ? options.length - 1 : i - 1));
    } else {
      setHighlighted(-1);
    }
  }

  useEffect(() => {
    if (draft === null && pinned === null) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setPinned(null);
      close();
    }
    function onKeyUp(event: KeyboardEvent) {
      // Only the pinned control; the field's Escape is handled on the input.
      if (event.key === "Escape") setPinned(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [draft, pinned]);

  return (
    <div
      ref={rootRef}
      // Tight — each tag already carries its own remove control's width.
      className="mt-[var(--space-item)] flex flex-wrap items-center gap-x-1.5 gap-y-1"
    >
      {tags.map((tag, index) => (
        <TagName
          key={tag}
          tag={tag}
          hue={hueOf(tag)}
          primary={index === 0}
          pinned={pinned === tag}
          onPin={() => setPinned(tag)}
          onRemove={() => {
            setPinned(null);
            onChange(tags.filter((t) => t !== tag));
          }}
        />
      ))}

      {draft === null ? (
        // No outline or fill — quieter than the tags.
        <button
          type="button"
          onClick={open}
          className={`${ROW_ITEM} text-[13px] text-ink-faint transition-colors hover:text-action`}
        >
          + tag
        </button>
      ) : (
        <span className={`${ROW_ITEM} relative`}>
          {/* A wash, not a border — findable without putting a box on the row. */}
          <span className="inline-flex items-center rounded-full bg-action-wash px-2.5 py-1 text-[13px] leading-none">
            <span aria-hidden className="text-ink-faint">
              #
            </span>
            <input
              ref={inputRef}
              // The button that opened it is gone, so nothing else focuses here.
              autoFocus
              value={draft}
              // Grow with the name.
              size={Math.max(draft.length + 1, 8)}
              placeholder="tag"
              aria-label="Add a tag"
              onChange={(e) => {
                setDraft(e.target.value);
                setHighlighted(-1);
              }}
              // Leaving without Enter discards — committing on blur would fight
              // the list's own mousedown.
              onBlur={() => window.setTimeout(close, 120)}
              onKeyDown={onKeyDown}
              // The wash is the affordance; `!` beats the unlayered
              // :focus-visible rule.
              className="bg-transparent text-[13px] text-ink outline-none focus-visible:outline-none!"
            />
          </span>

          {(options.length > 0 || isNew) && (
            <ul className={DROPDOWN}>
              {options.map((option, index) => (
                <li key={option.tag}>
                  {/* Group labels only when both groups are present. */}
                  {index === 0 &&
                    option.suggested &&
                    suggestedCount < options.length && (
                      <p className={GROUP_LABEL}>Suggested for this note</p>
                    )}
                  {index === suggestedCount && suggestedCount > 0 && (
                    <p className={GROUP_LABEL}>All tags</p>
                  )}
                  <button
                    type="button"
                    // mousedown, not click — the input's blur would kill the
                    // list first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(option.tag);
                    }}
                    onMouseEnter={() => setHighlighted(index)}
                    style={{ "--h": hueOf(option.tag) } as React.CSSProperties}
                    data-active={index === highlighted}
                    title={option.tag}
                    className={DROPDOWN_ROW}
                  >
                    <span className="hue-text">#{option.tag}</span>
                  </button>
                </li>
              ))}
              {isNew && (
                // Spelled out — a new word is entering the vocabulary.
                <li className="truncate px-3 py-1.5 text-[13px] text-ink-faint">
                  {options.length > 0 && (
                    <span className="mr-1.5" aria-hidden>
                      ↵
                    </span>
                  )}
                  Create <span className="text-ink">#{typed}</span>
                </li>
              )}
            </ul>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * One tag: its name and a remove control revealed on hover, focus or long
 * press. The first two are CSS (.tag-pill); React holds only the long press.
 */
function TagName({
  tag,
  hue,
  primary,
  pinned,
  onPin,
  onRemove,
}: {
  tag: string;
  hue: number;
  primary: boolean;
  pinned: boolean;
  onPin: () => void;
  onRemove: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a long press fires, so its release doesn't follow the link.
  const held = useRef(false);

  function cancelPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => cancelPress, []);

  return (
    <span
      style={{ "--h": hue } as React.CSSProperties}
      className={`tag-pill tag-pill-bleed group ${ROW_ITEM}`}
      onPointerDown={(e) => {
        // Mouse and pen already have hover; only touch needs the hold.
        if (e.pointerType !== "touch") return;
        held.current = false;
        cancelPress();
        timer.current = setTimeout(() => {
          held.current = true;
          onPin();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
    >
      <Link
        href={tagHref(tag)}
        title={
          primary
            ? "Primary tag — the one this note takes its colour from"
            : `All notes tagged #${tag}`
        }
        onClick={(e) => {
          if (!held.current) return;
          e.preventDefault();
          held.current = false;
        }}
        // The pill is the affordance (:focus-within); `!` beats the unlayered rule.
        className="tag-name hue-text text-[13px] font-medium focus-visible:outline-none!"
      >
        #{tag}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        onPointerUp={() => {
          held.current = false;
        }}
        aria-label={`Remove tag ${tag}`}
        title="Remove tag"
        data-pinned={pinned}
        // 16px wide (held in layout always, so nothing shifts) — every px here
        // is permanent gap between tags. Grey until hovered; red only then,
        // since "there's a control" and "this deletes" are separate moments.
        className="tag-remove grid h-7 w-4 place-items-center rounded-full text-ink-faint hover:text-danger focus-visible:text-danger focus-visible:outline-none!"
      >
        {/* A drawn cross, not the × glyph — hairline strokes vanish at this size. */}
        <CloseSmallIcon aria-hidden className="size-[11px]" />
      </button>
    </span>
  );
}
