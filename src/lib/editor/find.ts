import {
  getSearchQuery,
  openSearchPanel,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import {
  EditorSelection,
  type EditorState,
  type StateEffect,
} from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";

/**
 * Find and replace in the note body, as [FindPanel] and the editor's key
 * bindings both use it.
 *
 * CodeMirror ships `findNext`, `replaceAll` and friends, and none of them are
 * used here. They each walk the document their own way, which is fine when the
 * panel shows nothing but a field — but this panel shows a count and a
 * position, and a count that came from a different walk than the arrows is a
 * count that will eventually disagree with them. So everything below is driven
 * off one list of matches: what the widget counts, what the arrows land on, and
 * what Replace all rewrites are the same ranges.
 *
 * The one thing CodeMirror's own commands are still asked for is the panel
 * itself — [openSearchPanel] and [closeSearchPanel] own that, and the search
 * state field they toggle is also what paints the matches.
 */

/** A found range in the document. */
export type Match = { from: number; to: number };

/**
 * A ceiling on one scan. A note is small enough that this never comes up; it
 * is here so a single letter typed into the field can't walk a pathological
 * document to the end before the next keystroke lands.
 */
const MATCH_LIMIT = 5000;

/**
 * Enough room above a match to clear the content header (--head-h) and the widget
 * floating under it, so "next" never lands on a line hidden behind either.
 * `nearest`, so a match already in view doesn't move the page.
 */
const SCROLL = { y: "nearest", yMargin: 88 } as const;

/** Every match in the document, in document order. */
export function findMatches(state: EditorState, query: SearchQuery): Match[] {
  if (!query.valid) return [];
  const matches: Match[] = [];
  // `precise` is on the value at runtime but not on getCursor's declared type.
  // It is false when a match starts or ends *inside* a character whose
  // normalised form is several characters — the range then covers text that
  // isn't part of the hit, and rewriting it would eat the rest of that
  // character. Dropped here rather than at the replace, so the count never
  // promises a match that Replace all would refuse.
  const cursor = query.getCursor(state) as Iterator<
    Match & { precise?: boolean }
  >;
  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    if (step.value.precise !== false) {
      matches.push({ from: step.value.from, to: step.value.to });
    }
    if (matches.length >= MATCH_LIMIT) break;
  }
  return matches;
}

/** Which match the selection is sitting exactly on, or -1 for none. */
export function matchIndexAt(matches: Match[], state: EditorState): number {
  const { from, to } = state.selection.main;
  if (from === to) return -1;
  return matches.findIndex((match) => match.from === from && match.to === to);
}

/** The first match at or after `pos`, wrapping to the top of the document. */
function matchFrom(matches: Match[], pos: number): Match | undefined {
  return matches.find((match) => match.from >= pos) ?? matches[0];
}

/** Selects a match, scrolls it clear of the header, and says why it moved. */
function goTo(view: EditorView, match: Match): void {
  const selection = EditorSelection.single(match.from, match.to);
  view.dispatch({
    selection,
    effects: EditorView.scrollIntoView(selection.main, SCROLL),
    // Every dispatch in this file is tagged, and [CodeMirrorEditor] reads the
    // tag: a selection the search moved must not raise the AI menu the way a
    // selection the user dragged does.
    userEvent: "select.search",
  });
}

/** Move to the next (1) or previous (-1) match, wrapping at either end. */
export function stepMatch(view: EditorView, direction: 1 | -1): boolean {
  const matches = findMatches(view.state, getSearchQuery(view.state));
  if (matches.length === 0) return false;

  const { from, to } = view.state.selection.main;
  // Measured from the far edge of the selection in the direction of travel, so
  // stepping off the match you are on lands on its neighbour, not on itself.
  const next =
    direction === 1
      ? (matches.find((match) => match.from >= to) ?? matches[0])
      : (matches.findLast((match) => match.to <= from) ??
        matches[matches.length - 1]);
  if (!next) return false;

  goTo(view, next);
  return true;
}

/** ⌘G / F3 and their shifted twins — or, with nothing to look for, the panel. */
export function stepCommand(direction: 1 | -1): Command {
  return (view) =>
    getSearchQuery(view.state).valid
      ? stepMatch(view, direction)
      : openSearchPanel(view);
}

/** The current query with some of its fields changed. */
export function editedQuery(
  query: SearchQuery,
  edit: Partial<
    Pick<SearchQuery, "search" | "replace" | "caseSensitive" | "wholeWord">
  >,
): SearchQuery {
  return new SearchQuery({
    search: edit.search ?? query.search,
    replace: edit.replace ?? query.replace,
    caseSensitive: edit.caseSensitive ?? query.caseSensitive,
    wholeWord: edit.wholeWord ?? query.wholeWord,
    literal: query.literal,
    // The panel offers no regexp toggle, so it is stated here rather than
    // carried: a query that arrived with patterns on would leave the editor
    // searching by pattern with no control anywhere to turn it off.
    regexp: false,
  });
}

/**
 * Writes a query into the editor's search state. Unless only the replacement
 * text changed, it also moves to the match nearest the caret — searching as
 * you type, so the field is showing what it has found while it is still being
 * typed. Anchored at the caret's *start*, so extending a query keeps you on
 * the match you are already looking at for as long as it still matches.
 */
export function applyQuery(
  view: EditorView,
  query: SearchQuery,
  reveal: boolean,
): void {
  const effects: StateEffect<unknown>[] = [setSearchQuery.of(query)];
  let selection: EditorSelection | undefined;

  if (reveal) {
    const target = matchFrom(
      findMatches(view.state, query),
      view.state.selection.main.from,
    );
    if (target) {
      selection = EditorSelection.single(target.from, target.to);
      effects.push(EditorView.scrollIntoView(selection.main, SCROLL));
    }
  }

  view.dispatch({ effects, selection, userEvent: "select.search" });
}

/** Every match at once, as one multi-selection — then out of the way. */
export function selectAllMatches(view: EditorView): boolean {
  const matches = findMatches(view.state, getSearchQuery(view.state));
  if (matches.length === 0) return false;

  view.dispatch({
    selection: EditorSelection.create(
      matches.map((match) => EditorSelection.range(match.from, match.to)),
    ),
    userEvent: "select.search.matches",
  });
  // The point of selecting them all is to type over them, so the caret goes
  // back to the document rather than staying in the field.
  view.focus();
  return true;
}

/**
 * The replacement wearing the capitalisation of the text it replaces. Three
 * forms only — all lower, ALL UPPER, Capitalised. Anything else is left
 * exactly as it was typed, because there is no one right answer for `wORD`.
 */
export function preserveCase(source: string, replacement: string): string {
  if (!replacement) return replacement;

  const lower = source.toLowerCase();
  const upper = source.toUpperCase();
  // A match with no cased letters in it — `42`, `---` — has no case to lend.
  if (lower === upper) return replacement;

  if (source === lower) return replacement.toLowerCase();
  if (source === upper) return replacement.toUpperCase();
  if (source[0] === upper[0] && source.slice(1) === lower.slice(1)) {
    return replacement[0]!.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Replaces the match the selection is on, then moves to the next. With nothing
 * selected the first press only finds: the same two-step every editor's
 * Replace button does, so a stray press can't rewrite text nobody has looked
 * at yet.
 */
export function replaceMatch(view: EditorView, preserve: boolean): boolean {
  if (view.state.readOnly) return false;

  const query = getSearchQuery(view.state);
  const matches = findMatches(view.state, query);
  if (matches.length === 0) return false;

  const index = matchIndexAt(matches, view.state);
  if (index === -1) {
    const target = matchFrom(matches, view.state.selection.main.from);
    if (target) goTo(view, target);
    return true;
  }

  const target = matches[index]!;
  const insert = preserve
    ? preserveCase(view.state.sliceDoc(target.from, target.to), query.replace)
    : query.replace;
  const changes = view.state.changes({
    from: target.from,
    to: target.to,
    insert,
  });

  // Where to land: the following match (wrapping round), mapped through the
  // edit into the document that is about to exist — or, when that was the only
  // one, the caret just past what was written.
  const following =
    matches.length > 1 ? (matches[index + 1] ?? matches[0]) : undefined;
  const selection = following
    ? EditorSelection.single(following.from, following.to).map(changes)
    : EditorSelection.single(target.from + insert.length);

  view.dispatch({
    changes,
    selection,
    effects: EditorView.scrollIntoView(selection.main, SCROLL),
    userEvent: "input.replace",
  });
  return true;
}

/** Every match, in one undoable edit. */
export function replaceAllMatches(view: EditorView, preserve: boolean): boolean {
  if (view.state.readOnly) return false;

  const query = getSearchQuery(view.state);
  const matches = findMatches(view.state, query);
  if (matches.length === 0) return false;

  view.dispatch({
    changes: matches.map((match) => ({
      from: match.from,
      to: match.to,
      insert: preserve
        ? preserveCase(view.state.sliceDoc(match.from, match.to), query.replace)
        : query.replace,
    })),
    userEvent: "input.replace.all",
  });
  return true;
}
