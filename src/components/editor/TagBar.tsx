"use client";

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
  /**
   * Candidate tags for this note's text. Called when the field opens, not on
   * every keystroke — the heuristic reads the whole note, and nothing needs
   * its answer until someone asks.
   */
  onSuggest: () => string[];
};

/** Lets ⌘K open the field the same way the `+ tag` control does. */

/** How many completions the list shows at once. */
const OPTION_LIMIT = 8;

/**
 * The height of every item in the row, in px.
 *
 * Set on the items rather than on the row, so it holds per line once the tags
 * wrap. Bare text is 13px tall and the open field is 25px, so without this the
 * row grew by half its height the moment `+ tag` was pressed and every tag
 * slid down to re-centre — a jump on the way into an unrelated action.
 */
const ROW_ITEM = "flex h-7 items-center";

/** How long a touch has to be held before it means "remove this". */
const LONG_PRESS_MS = 450;

// Width is capped rather than left to the content: a deeply nested name like
// `#a/b/c/d/e` is long enough to throw a list clear across the window, and the
// row it lands in is the same row either way.
const DROPDOWN =
  "glass lift-2 absolute top-full left-0 z-30 mt-1.5 max-h-72 w-max max-w-[min(20rem,calc(100vw-3rem))] overflow-y-auto rounded-[var(--radius-zone)] p-1.5";

const DROPDOWN_ROW =
  "hue-row block w-full truncate rounded-[var(--radius-control)] px-3 py-1.5 text-left text-[13px] text-ink";

const GROUP_LABEL = "px-3 pt-1.5 pb-1 text-[11px] text-ink-faint";

/** One row of the completion list. */
type Option = { tag: string; suggested: boolean };

/**
 * The note's tags, above the body — the one place a note is filed.
 *
 * This exists because the alternative was writing tags into the prose, where
 * there is no right place for them: not the top (they push the first sentence
 * down), not the bottom (out of sight while writing), not inline (they have to
 * fit the sentence). A note's filing isn't part of what it says, so it gets its
 * own line above the text rather than a spot inside it.
 *
 * At rest the row is tag names and one muted `+ tag`, and nothing else — no
 * outlines, no chips, no visible delete buttons. Everything else here is
 * revealed by reaching for it.
 */
export function TagBar({ tags, allTags, onChange, onSuggest }: Props) {
  const { hueOf } = useTagHues();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // null while the field is closed; the pending name (initially "") once it's
  // open. Opening is also what asks for suggestions.
  const [draft, setDraft] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Which row the arrow keys are on. -1 is "none" — Enter then commits exactly
  // what was typed, which is how a genuinely new tag gets made.
  const [highlighted, setHighlighted] = useState(-1);
  // The tag whose remove control a long-press has pinned open. Hover can't do
  // this on a touchscreen, so holding a tag is the way in.
  const [pinned, setPinned] = useState<string | null>(null);

  const typed = normalizeTag((draft ?? "").trim().replace(/^#/, ""));

  function open() {
    const taken = new Set(tags);
    setSuggestions(onSuggest().filter((tag) => !taken.has(tag)));
    setPinned(null);
    setHighlighted(-1);
    setDraft("");
  }

  /**
   * The list under the field: what this note looks like it wants first, then
   * everything else. Merging the two is what lets one control do both jobs —
   * a separate "suggest" button would be a second way to reach the same list.
   */
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
      // A prefix match is what the user is most likely reaching for; the
      // substring matches follow rather than being mixed in among them.
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
    // Stay open: tagging is usually more than one tag, and reopening the field
    // for each of them turns a two-second job into four clicks.
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
      // Escape here is "stop tagging", not "leave the note" — the editor's own
      // Escape handler would otherwise navigate away mid-word.
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
      // Only the pinned control closes here; the field's own Escape is handled
      // on the input, which stops the note view from navigating away too.
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
      // Tight, because each tag already carries the width of its own remove
      // control. Anything under 6px and a hovered pill's bleed would reach the
      // next tag's text.
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
        // No outline, no fill. It used to be the only pill on the row, which
        // made the control to add a tag louder than the tags themselves.
        <button
          type="button"
          onClick={open}
          className={`${ROW_ITEM} text-[13px] text-ink-faint transition-colors hover:text-action`}
        >
          + tag
        </button>
      ) : (
        <span className={`${ROW_ITEM} relative`}>
          {/* A wash rather than a border: the field still has to be findable
              while it's being typed into, but an outline here would put the
              one box on the row back. */}
          <span className="inline-flex items-center rounded-full bg-action-wash px-2.5 py-1 text-[13px] leading-none">
            <span aria-hidden className="text-ink-faint">
              #
            </span>
            <input
              ref={inputRef}
              // Focus the field the moment it replaces the button — the click
              // that opened it was on a button that no longer exists, so
              // nothing else would put the caret here.
              autoFocus
              value={draft}
              // Grow with the name instead of reserving a fixed field width.
              size={Math.max(draft.length + 1, 8)}
              placeholder="tag"
              aria-label="Add a tag"
              onChange={(e) => {
                setDraft(e.target.value);
                setHighlighted(-1);
              }}
              // Committing on blur would fight the list, whose own mousedown
              // blurs the field. Leaving without pressing Enter discards,
              // which is the safer of the two.
              onBlur={() => window.setTimeout(close, 120)}
              onKeyDown={onKeyDown}
              // The global :focus-visible outline would draw an accent ring
              // inside the field; the wash is the affordance here. That rule
              // is unlayered, so it outranks any utility layer regardless of
              // specificity — hence the `!`.
              className="bg-transparent text-[13px] text-ink outline-none focus-visible:outline-none!"
            />
          </span>

          {(options.length > 0 || isNew) && (
            <ul className={DROPDOWN}>
              {options.map((option, index) => (
                <li key={option.tag}>
                  {/* The two groups are labelled only when both are present —
                      one unlabelled list is just the list. */}
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
                    // mousedown, not click: the input's blur fires first and
                    // would tear the list down before a click ever landed.
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
                // Spelled out rather than silent: this is the moment a new
                // word enters the collection's vocabulary, and it should be
                // clear that's what's happening rather than a typo landing.
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
 * One tag: its name, and a remove control that is invisible until you reach
 * for it — hover, keyboard focus, or a long press.
 *
 * All three states are CSS (see .tag-pill in globals.css); the only thing
 * React holds here is the long press, which has no selector.
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
  // Set when a long press has fired, so the tap that ends it doesn't also
  // follow the link out to the tag's index.
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
        // The pill around it is the hover affordance, and the pill is what
        // :focus-within lights up — so this needs no ring and no underline of
        // its own. That rule is unlayered, hence the `!`.
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
        // The width is the tag bar's tightest constraint: it is held in the
        // layout at all times (so nothing shifts when it appears), which means
        // every px here is px of permanent distance between one tag and the
        // next. 16 wide, and the height carries the rest of the target.
        // Grey until it is the thing under the cursor. Revealing the control
        // and warning about it are two different moments: the pill opening is
        // "there is something here", and red is "this one deletes" — spending
        // the alarm colour on the first leaves nothing to say the second with.
        className="tag-remove grid h-7 w-4 place-items-center rounded-full text-ink-faint hover:text-danger focus-visible:text-danger focus-visible:outline-none!"
      >
        {/* A drawn cross rather than the × glyph: at this size the character's
            strokes are hairlines, and it read as a speck next to the tag name
            it belongs to. Stroked, it holds its weight. */}
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="size-[11px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M3.25 3.25 8.75 8.75M8.75 3.25 3.25 8.75" />
        </svg>
      </button>
    </span>
  );
}
