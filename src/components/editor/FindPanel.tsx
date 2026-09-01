"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { closeSearchPanel, getSearchQuery } from "@codemirror/search";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CloseSmallIcon,
  SelectAllIcon,
} from "@/icons";
import {
  applyQuery,
  editedQuery,
  findMatches,
  matchIndexAt,
  replaceAllMatches,
  replaceMatch,
  selectAllMatches,
  stepMatch,
} from "@/lib/editor/find";

/**
 * `main-field` is how @codemirror/search's own `openSearchPanel` finds the
 * field to seed and focus. Kept out of the JSX as a value rather than written
 * inline, because a dashed attribute isn't in React's `input` props.
 */
const MAIN_FIELD = { "main-field": "true" };

/** A square control in the widget's right-hand cluster. */
const iconButton =
  "row-tint grid size-6 shrink-0 place-items-center rounded-[var(--radius-control)] text-ink disabled:pointer-events-none disabled:text-ink-faint disabled:opacity-25";

/** The two replace verbs. Words, not glyphs — a rewrite should say so. */
const textButton =
  "row-tint h-6 shrink-0 rounded-[var(--radius-control)] px-2 text-[12px] text-ink disabled:pointer-events-none disabled:text-ink-faint disabled:opacity-25";

/** A field, on the same well the ⌘K trigger is cut into. */
const fieldWell =
  "well well-shallow flex h-7 w-full min-w-0 items-center gap-0.5 rounded-[var(--radius-control)] bg-sunk pl-2 pr-1";

const fieldInput =
  "min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none focus-visible:outline-none!";

type Props = {
  view: EditorView;
  /**
   * The editor state as of the last change the widget cares about — the text,
   * the selection, or the query. Read for everything the widget shows; the
   * view is only ever *written* to.
   */
  state: EditorState;
  /** Held by the editor, not here, so it survives closing and reopening. */
  replaceOpen: boolean;
  onReplaceOpenChange: (open: boolean) => void;
  preserveCase: boolean;
  onPreserveCaseChange: (on: boolean) => void;
};

/**
 * Find and replace, floating over the top of the source column, centred.
 *
 * It is rendered into the panel CodeMirror opens (see [CodeMirrorEditor]'s
 * `search` config) rather than beside the editor, which buys three things that
 * would otherwise have to be rebuilt: ⌘F seeds the field from the selection
 * and focuses it, Escape hands focus back to the document, and the content's
 * blur-to-save doesn't fire when the caret moves into this field, because the
 * field is inside the editor.
 *
 * No regexp toggle. This is a notes app; the two things a pattern is usually
 * reached for here — case and word boundaries — each have a switch of their
 * own, and the third row of controls a pattern needs (and the errors it can
 * raise) is a cost with no reader behind it.
 */
export function FindPanel({
  view,
  state,
  replaceOpen,
  onReplaceOpenChange,
  preserveCase,
  onPreserveCaseChange,
}: Props) {
  const findRef = useRef<HTMLInputElement>(null);

  // Opened by a keystroke, so the caret goes straight into the field with
  // whatever ⌘F seeded it with selected — the next thing typed replaces it.
  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
  }, []);

  const query = getSearchQuery(state);
  const matches = findMatches(state, query);
  const index = matchIndexAt(matches, state);
  const nothingToFind = matches.length === 0;

  /** Every field and flag writes back the same way: one edited query. */
  function edit(
    change: Parameters<typeof editedQuery>[1],
    { reveal = true } = {},
  ) {
    applyQuery(view, editedQuery(query, change), reveal);
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const mod = event.metaKey || event.ctrlKey;

    if (event.key === "Escape") {
      event.preventDefault();
      // Puts the caret back where it was in the note — closeSearchPanel hands
      // focus to the document when it was in the panel.
      closeSearchPanel(view);
      return;
    }
    // ⌘F with the widget already up: back to the field, text selected.
    if (mod && event.key.toLowerCase() === "f") {
      event.preventDefault();
      findRef.current?.focus();
      findRef.current?.select();
      return;
    }
    if (event.key === "F3" || (mod && event.key.toLowerCase() === "g")) {
      event.preventDefault();
      stepMatch(view, event.shiftKey ? -1 : 1);
    }
  }

  return (
    // Fixed height on the rows and none on the panel: opening replace grows it
    // downwards over the text, which is the one direction it can grow without
    // moving the field the caret is in.
    <div
      role="search"
      aria-label="Find in note"
      onKeyDown={onPanelKeyDown}
      className="glass lift-2 flex items-start gap-1 rounded-[var(--radius-zone)] p-1.5"
    >
      <button
        type="button"
        aria-expanded={replaceOpen}
        aria-label={replaceOpen ? "Hide replace" : "Show replace"}
        title={replaceOpen ? "Hide replace" : "Show replace"}
        onClick={() => onReplaceOpenChange(!replaceOpen)}
        className={`${iconButton} mt-0.5`}
      >
        <ChevronDownIcon
          aria-hidden
          className={`size-3 transition-transform duration-[var(--tint-motion)] motion-reduce:transition-none ${
            replaceOpen ? "" : "-rotate-90"
          }`}
        />
      </button>

      {/* A grid rather than two flex rows, for one reason: a grid column is as
          wide as the widest thing in it, in *every* row. That is what keeps the
          two fields the same width and their flags on one vertical line, when
          the controls beside them are four squares on one row and two words on
          the other. */}
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
        <div className={fieldWell}>
          <input
            {...MAIN_FIELD}
            ref={findRef}
            type="text"
            value={query.search}
            onChange={(event) => edit({ search: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (event.altKey) selectAllMatches(view);
              else stepMatch(view, event.shiftKey ? -1 : 1);
            }}
            placeholder="Find"
            aria-label="Find"
            className={fieldInput}
          />
          <Flag
            on={query.caseSensitive}
            label="Match case"
            onToggle={() => edit({ caseSensitive: !query.caseSensitive })}
          >
            Aa
          </Flag>
          <Flag
            on={query.wholeWord}
            label="Whole word"
            onToggle={() => edit({ wholeWord: !query.wholeWord })}
          >
            {/* The rule under it is the whole difference from `Aa`. */}
            <span className="underline decoration-1 underline-offset-[3px]">
              ab
            </span>
          </Flag>
        </div>

        <div className="flex items-center gap-1">
          {/* Tabular figures, so counting up through a note doesn't make the
              arrows beside it shuffle left and right. */}
          <p
            role="status"
            aria-live="polite"
            className={`min-w-[62px] shrink-0 px-1 text-right text-[11px] tabular-nums ${
              nothingToFind ? "text-ink-faint" : "text-ink-muted"
            }`}
          >
            {countLabel(query.search, matches.length, index)}
          </p>

          <button
            type="button"
            disabled={nothingToFind}
            onClick={() => stepMatch(view, -1)}
            aria-label="Previous match"
            title="Previous match (⇧↵)"
            className={iconButton}
          >
            <ArrowUpIcon aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={nothingToFind}
            onClick={() => stepMatch(view, 1)}
            aria-label="Next match"
            title="Next match (↵)"
            className={iconButton}
          >
            <ArrowDownIcon aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={nothingToFind}
            onClick={() => selectAllMatches(view)}
            aria-label="Select all matches"
            title="Select all matches (⌥↵)"
            className={iconButton}
          >
            <SelectAllIcon aria-hidden className="size-3.5" />
          </button>

          {/* Stood off from the three verbs — closing isn't one of them. */}
          <button
            type="button"
            onClick={() => closeSearchPanel(view)}
            aria-label="Close find"
            title="Close (Esc)"
            className={`${iconButton} ml-1`}
          >
            <CloseSmallIcon aria-hidden className="size-3" />
          </button>
        </div>

        {replaceOpen && (
          <>
            <div className={fieldWell}>
              <input
                type="text"
                value={query.replace}
                // No reveal: changing what you would write is not a reason to
                // move the note under the widget.
                onChange={(event) =>
                  edit({ replace: event.target.value }, { reveal: false })
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (event.altKey) replaceAllMatches(view, preserveCase);
                  else replaceMatch(view, preserveCase);
                }}
                placeholder="Replace"
                aria-label="Replace"
                className={fieldInput}
              />
              <Flag
                on={preserveCase}
                label="Preserve case"
                onToggle={() => onPreserveCaseChange(!preserveCase)}
              >
                AB
              </Flag>
            </div>

            {/* Left in the shared column, so they start where the count above
                them does rather than hanging off the panel's right edge. */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={nothingToFind}
                onClick={() => replaceMatch(view, preserveCase)}
                title="Replace (↵)"
                className={textButton}
              >
                Replace
              </button>
              <button
                type="button"
                disabled={nothingToFind}
                onClick={() => replaceAllMatches(view, preserveCase)}
                title="Replace all (⌥↵)"
                className={textButton}
              >
                All
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What the count says. Empty while there is nothing to look for — a field
 * nobody has typed in yet has not failed to find anything.
 */
function countLabel(search: string, total: number, index: number): string {
  if (!search) return "";
  if (total === 0) return "No results";
  // The position, once the selection is sitting on one of them. Stepping or
  // typing always leaves it on one; clicking away in the note doesn't, and
  // then the honest answer is just how many there are.
  if (index >= 0) return `${index + 1} of ${total}`;
  return total === 1 ? "1 match" : `${total} matches`;
}

type FlagProps = {
  on: boolean;
  /** Its name, as both the tooltip and the accessible label. */
  label: string;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * One of the three switches that live inside a field. Mono, because that is
 * what mono is for in this app — and because `Aa` is a specimen of the thing
 * it turns on, not a word.
 */
function Flag({ on, label, onToggle, children }: FlagProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`grid size-5 shrink-0 place-items-center rounded-[var(--radius-control)] font-mono text-[10px] leading-none ${
        // No `.row-tint` on the on state: its hover tint outranks the fill, and
        // an armed switch going pale under the pointer reads as turning off.
        on
          ? "bg-[color-mix(in_srgb,var(--ink)_22%,transparent)] text-ink"
          : "row-tint text-ink-faint hover:text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}
