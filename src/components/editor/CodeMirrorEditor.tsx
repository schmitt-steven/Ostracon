"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { lintKeymap } from "@codemirror/lint";
import {
  closeSearchPanel,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  selectNextOccurrence,
  selectSelectionMatches,
  setSearchQuery,
} from "@codemirror/search";
import { EditorState, Prec } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  keymap,
  placeholder as placeholderExt,
  rectangularSelection,
  type KeyBinding,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { stepCommand } from "@/lib/editor/find";
import { uploadImage } from "@/lib/images/upload-client";
import { isAllowedImageType } from "@/lib/images/upload-rules";
import { FindPanel } from "./FindPanel";

/**
 * `searchKeymap` from @codemirror/search, with two departures.
 *
 * The step commands are [lib/editor/find]'s rather than the package's, so the
 * keyboard and the widget's arrows walk the same list of matches — see there
 * for why that matters.
 *
 * And `Mod-Alt-g` (go to line) is gone. It opens a *second* kind of panel, in
 * the package's own unstyled markup, into a container this editor has restyled
 * as a floating widget — and a line number is not something a note has. The
 * two multi-cursor bindings stay: they belong to the editor, not to the panel.
 */
const findKeymap: KeyBinding[] = [
  { key: "Mod-f", run: openSearchPanel },
  { key: "Escape", run: closeSearchPanel },
  {
    key: "Mod-g",
    run: stepCommand(1),
    shift: stepCommand(-1),
    preventDefault: true,
  },
  {
    key: "F3",
    run: stepCommand(1),
    shift: stepCommand(-1),
    preventDefault: true,
  },
  { key: "Mod-Shift-l", run: selectSelectionMatches },
  { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
];

/**
 * `basicSetup` from the `codemirror` package, minus every gutter and the
 * active-line background — notes are prose. Inlined and adjusted per that
 * extension's own docs; everything else is verbatim, in the original order.
 */
const editorSetup = [
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  // No autocompletion() here, and no completionKeymap below: there is nothing
  // to complete in a note. Prose is prose.
  rectangularSelection(),
  crosshairCursor(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...findKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...lintKeymap,
  ]),
];

const SELECTION_BG = "color-mix(in srgb, var(--accent) 22%, transparent)";

const appTheme = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "transparent",
    // Content-driven — the editor grows with its text, the surface scrolls.
    height: "auto",
  },
  // Sans at 16px/1.75, matching the rendered side, so Split reads as one
  // document.
  ".cm-content": {
    fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
    fontSize: "16px",
    lineHeight: "1.75",
    caretColor: "var(--accent)",
    padding: "0",
  },
  // Must not scroll itself, or the content-driven height means nothing.
  ".cm-scroller": {
    overflow: "visible",
    fontFamily: "inherit",
    lineHeight: "inherit",
  },
  // Undo the base theme's per-line padding so text sits in the content's column.
  ".cm-line": {
    padding: "0",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  // No box on this surface, so no focus ring — the caret is the cue, as in the
  // title field.
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content:focus-visible": {
    outline: "none",
  },
  // The app's empty-field token, so it follows the theme.
  ".cm-placeholder": {
    color: "var(--ink-faint)",
  },
  // Unfocused, plus nested inputs (the search panel).
  ".cm-selectionBackground, ::selection": {
    backgroundColor: SELECTION_BG,
  },
  // The focused case — the full selector path, to tie drawSelection's
  // five-class base rule on specificity (a theme wins ties). Its `&light`
  // branch applies since this theme never declares itself dark; the app
  // switches palettes at runtime.
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: SELECTION_BG,
  },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in srgb, var(--ink) 12%, transparent)",
  },
  // ── Where the find widget hangs ──────────────────────────────────────────
  // CodeMirror puts a top panel in the flow above the text. In a content area that
  // scrolls its whole document that would be a bar which scrolls away — so the
  // container takes no height at all and sticks instead: the widget floats
  // over the top of the column, centred, and stays there while the note moves
  // under it, which is where an editor puts a find box.
  //
  // It has no material of its own; [FindPanel] is the glass. Selectors carry
  // the extra class so they outrank the base theme's own `.cm-panels-top`.
  ".cm-panels, .cm-panels.cm-panels-top": {
    backgroundColor: "transparent",
    color: "var(--ink)",
    border: "none",
  },
  ".cm-panels.cm-panels-top": {
    position: "sticky",
    // Measured from the scroller's *content* box, and [ContentBody] already
    // pads that by --head-h to stand clear of the header — so this is the gap
    // below the header, not the distance from the top of the content.
    top: "12px",
    // No height, so the text it floats over doesn't move to make room.
    height: "0",
    overflow: "visible",
    // Under the header (20) and under every floating menu (50). CodeMirror's
    // own default is 300, which would put a search box over the breadcrumb.
    zIndex: "15",
    display: "flex",
    justifyContent: "center",
  },
  ".cm-panels .cm-panel": {
    width: "min(400px, 100%)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
    borderRadius: "2px",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
  },
});

/**
 * Syntax colours for the source editor, on the app's tokens so it follows the
 * theme (unlike editorSetup's fixed-hex `defaultHighlightStyle`). Registered
 * without `fallback` so it takes precedence. Markdown tags first, embedded
 * fenced-code tags after — both hit the same element and the later rule wins.
 */
const appHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--ink)", fontWeight: "600" },
  { tag: t.strong, color: "var(--ink)", fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.quote, color: "var(--ink-muted)", fontStyle: "italic" },
  // No rule for t.list — the parser spreads it over every descendant, so it
  // would paint list prose too and win the cascade tie against the inline
  // rules above. The bullet itself is a processingInstruction, held back below.
  { tag: t.link, color: "var(--action)" },
  { tag: t.url, color: "var(--action)", textDecoration: "underline" },
  { tag: t.labelName, color: "var(--ink-muted)" },
  {
    tag: t.monospace,
    color: "var(--accent)",
    // The surface is set in sans now, so code has to say so itself.
    fontFamily: "var(--font-plex-mono), monospace",
  },
  { tag: t.escape, color: "var(--ink-faint)" },
  { tag: t.character, color: "var(--accent)" },
  { tag: t.contentSeparator, color: "var(--ink-faint)" },
  // The markup itself — #, *, backticks, list bullets, link brackets. Held
  // back so the text reads over its own punctuation.
  { tag: t.processingInstruction, color: "var(--ink-faint)" },

  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword],
    color: "var(--action)",
  },
  { tag: [t.operator, t.derefOperator], color: "var(--ink-muted)" },
  { tag: [t.string, t.regexp, t.special(t.string)], color: "var(--green)" },
  { tag: [t.number, t.bool, t.atom, t.null], color: "var(--accent)" },
  {
    tag: [t.typeName, t.className, t.namespace, t.tagName],
    color: "var(--accent-hover)",
  },
  { tag: [t.propertyName, t.attributeName], color: "var(--ink)" },
  { tag: t.function(t.variableName), color: "var(--action-hover)" },
  { tag: t.comment, color: "var(--ink-faint)", fontStyle: "italic" },
  { tag: t.invalid, color: "var(--danger)" },
]);

// Finds its target by searching the current document, not by paste-time
// offsets, which typing elsewhere during the upload would invalidate.
function replacePlaceholder(
  view: EditorView,
  marker: string,
  replacement: string,
) {
  const text = view.state.doc.toString();
  const index = text.indexOf(marker);
  if (index === -1) return;
  view.dispatch({
    changes: { from: index, to: index + marker.length, insert: replacement },
  });
}

/** A placeholder no other pending upload is using — two `Screenshot.png`s
 * dropped together would otherwise share a marker. */
function uniqueMarker(doc: string, taken: string[], name: string): string {
  const label = name || "image";
  let marker = `![Uploading ${label}…]()`;
  for (let n = 2; doc.includes(marker) || taken.includes(marker); n += 1) {
    marker = `![Uploading ${label} (${n})…]()`;
  }
  return marker;
}

/** Square brackets would close the alt text early and break the image. */
function altFor(name: string): string {
  return name.replace(/[[\]]/g, " ").trim() || "image";
}

/** Sends one file and swaps its placeholder for the result, or for a failure. */
function startUpload(view: EditorView, file: File, marker: string): void {
  void uploadImage(file).then(
    (url) => replacePlaceholder(view, marker, `![${altFor(file.name)}](${url})`),
    () => replacePlaceholder(view, marker, "![Image upload failed]()"),
  );
}

function imagePasteHandler() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = event.clipboardData?.files;
      // The same allowlist as the drop path and the upload route.
      const imageFile = files
        ? [...files].find((f) => isAllowedImageType(f.type))
        : undefined;
      if (!imageFile) return false;

      event.preventDefault();
      const marker = uniqueMarker(view.state.doc.toString(), [], imageFile.name);
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: marker },
        selection: { anchor: from + marker.length },
      });

      startUpload(view, imageFile, marker);
      return true;
    },
  });
}

// The whole clipboard must be one bare URL.
const URL_RE = /^(?:https?:\/\/|mailto:)\S+$/i;

// Fallback link text — the bare host, when nothing was selected to wrap.
function labelFor(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "mailto:"
      ? parsed.pathname
      : parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function urlPasteHandler() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const url = event.clipboardData?.getData("text/plain").trim();
      if (!url || !URL_RE.test(url)) return false;

      const { from, to } = view.state.selection.main;
      // Leave a paste into a link's `](…)` alone — no nested links.
      if (view.state.sliceDoc(Math.max(0, from - 2), from) === "](")
        return false;

      const selected = view.state.sliceDoc(from, to).trim();
      const label = selected || labelFor(url);
      const insert = `[${label}](${url})`;

      event.preventDefault();
      view.dispatch({
        changes: { from, to, insert },
        // Caret past the link if the user selected the label; else select the
        // guessed host so typing replaces it.
        selection: selected
          ? { anchor: from + insert.length }
          : { anchor: from + 1, head: from + 1 + label.length },
        scrollIntoView: true,
      });
      return true;
    },
  });
}

// Anchors a popup below the selection's head. `coordsAtPos` returns null when
// that position is scrolled out of view — then the editor's top-left.
function anchorAtCursor(view: EditorView): { x: number; y: number } {
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (coords) return { x: coords.left, y: coords.bottom };
  const box = view.dom.getBoundingClientRect();
  return { x: box.left + 16, y: box.top + 16 };
}

/**
 * Where an AI prompt was opened from — a selection, or the ask shortcut at the
 * bare cursor (empty `text` = "ask about the note").
 */
export type AiAnchor = {
  /** Viewport coordinates to position the menu at. */
  x: number;
  y: number;
  /** The selected text; empty when opened from the cursor. */
  text: string;
  /** The selection this was raised on, collapsed when raised at the cursor. */
  from: number;
  to: number;
};

/** Where an accepted answer goes: over the selection, or after the block. */
export type AnswerPlacement = "replace" | "below";

export type EditorHandle = {
  /** Scrolls the given 1-based source line into view at the top. */
  scrollToLine: (line: number) => void;
  /** Re-measures after the editor goes from hidden back to visible. */
  remeasure: () => void;
  /** Puts the caret in the document — what ⌘K's "Write" command needs. */
  focus: () => void;
  /** Appends text at the end, on its own line. Used by "Suggest tags". */
  append: (text: string) => void;
  /** Uploads images and writes them in as their own block. `at` (viewport
   * coords) is where a drop landed; absent from the file dialog. */
  insertImages: (files: File[], at?: { x: number; y: number }) => void;
  /** Claims `from`..`to` as an in-flight answer's range, mapped through every
   * edit until it's used. */
  beginAnswer: (from: number, to: number) => void;
  /** Writes a reviewed answer into the claimed range, then releases it. */
  applyAnswer: (text: string, placement: AnswerPlacement) => void;
  /** Releases the claimed range without writing anything. */
  endAnswer: () => void;
};

/** What [FindPanel] is drawn into, and what it is drawn from. */
type FindHost = {
  view: EditorView;
  /** The panel element CodeMirror opened — the portal's target. */
  dom: HTMLElement;
  /** Refreshed on every change the widget reads: text, selection, query. */
  state: EditorState;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Fires with the 1-based line the user clicked on. */
  onLineClick?: (line: number) => void;
  /** Drives the selection AI menu — an anchor when a non-empty selection
   * settles, null on any click/keystroke. Never blocks the native menu. */
  onSelectionMenu?: (anchor: AiAnchor | null) => void;
  /** Fires on the ask shortcut (⌘J / Ctrl-J), selection or not. */
  onAskShortcut?: (anchor: AiAnchor) => void;
  placeholder?: string;
  /** Focus the body at position 0 on mount — just "the editor is live". */
  autoFocus?: boolean;
  className?: string;
  ref?: Ref<EditorHandle>;
};

export function CodeMirrorEditor({
  value,
  onChange,
  onLineClick,
  onSelectionMenu,
  onAskShortcut,
  placeholder,
  autoFocus = false,
  className,
  ref,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const onLineClickRef = useRef(onLineClick);
  useEffect(() => {
    onLineClickRef.current = onLineClick;
  }, [onLineClick]);
  const onSelectionMenuRef = useRef(onSelectionMenu);
  useEffect(() => {
    onSelectionMenuRef.current = onSelectionMenu;
  }, [onSelectionMenu]);
  const onAskShortcutRef = useRef(onAskShortcut);
  useEffect(() => {
    onAskShortcutRef.current = onAskShortcut;
  }, [onAskShortcut]);
  // True between mousedown and mouseup in the editor — pointer selections are
  // reported once on release, not per mousemove.
  const draggingRef = useRef(false);

  // The find widget, while it is up: the element CodeMirror opened for it, and
  // the state it is drawing from. Null when closed — which is also what the
  // ref says, so the update listener can leave the state alone the rest of the
  // time rather than re-rendering this component on every keystroke.
  const [find, setFind] = useState<FindHost | null>(null);
  const findOpenRef = useRef(false);
  // Both are the widget's, but they live here so they survive it: closing and
  // reopening ⌘F shouldn't forget that you had the replace row out.
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [preserveCase, setPreserveCase] = useState(false);

  // The range an answer under review belongs to (or null), mapped through
  // every doc change so a stale offset can't be used.
  const answerRangeRef = useRef<{ from: number; to: number } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line) {
        const view = viewRef.current;
        if (!view) return;
        const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
        view.dispatch({
          effects: EditorView.scrollIntoView(
            view.state.doc.line(clamped).from,
            {
              y: "start",
              yMargin: 16,
            },
          ),
        });
      },
      remeasure() {
        viewRef.current?.requestMeasure();
      },
      focus() {
        viewRef.current?.focus();
      },
      append(text) {
        const view = viewRef.current;
        if (!view) return;
        const end = view.state.doc.length;
        // A blank line before it, unless the note is empty or already ends in one.
        const tail = view.state.sliceDoc(Math.max(0, end - 2), end);
        const lead =
          end === 0
            ? ""
            : tail.endsWith("\n\n")
              ? ""
              : tail.endsWith("\n")
                ? "\n"
                : "\n\n";
        view.dispatch({
          changes: { from: end, insert: `${lead}${text}` },
          selection: { anchor: end + lead.length + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      insertImages(files, at) {
        const view = viewRef.current;
        if (!view || files.length === 0) return;

        // Exact, not nearest — a drop beside the text answers null and falls
        // back to the caret.
        const dropped = at ? view.posAtCoords(at) : null;
        const aimed = dropped ?? view.state.selection.main.head;

        // Snapped to the nearer end of the paragraph — an image is a block and
        // shouldn't split a sentence.
        const line = view.state.doc.lineAt(aimed);
        const pos =
          aimed - line.from <= line.to - aimed ? line.from : line.to;

        const doc = view.state.doc.toString();
        const markers: string[] = [];
        for (const file of files) {
          markers.push(uniqueMarker(doc, markers, file.name));
        }

        // Its own block, unlike a paste.
        const lead = pos === 0 || view.state.sliceDoc(pos - 1, pos) === "\n" ? "" : "\n\n";
        const tail =
          pos === doc.length || view.state.sliceDoc(pos, pos + 1) === "\n"
            ? ""
            : "\n\n";
        const insert = `${lead}${markers.join("\n\n")}${tail}`;

        view.dispatch({
          changes: { from: pos, insert },
          // Caret after the images — the next thing typed is a caption.
          selection: { anchor: pos + insert.length - tail.length },
          scrollIntoView: true,
        });

        files.forEach((file, index) => {
          startUpload(view, file, markers[index]!);
        });
        view.focus();
      },
      beginAnswer(from, to) {
        answerRangeRef.current = { from, to };
      },
      applyAnswer(text, placement) {
        const view = viewRef.current;
        const range = answerRangeRef.current;
        answerRangeRef.current = null;
        if (!view || !range) return;

        // "below" lands after the whole source line, so a half-sentence
        // selection doesn't split the paragraph.
        const replacing = placement === "replace";
        const from = replacing
          ? range.from
          : view.state.doc.lineAt(range.to).to;
        const to = replacing ? range.to : from;
        const insert = replacing ? text : `\n\n${text}`;

        view.dispatch({
          changes: { from, to, insert },
          // Caret at the end, not a selection — that would re-open the AI menu.
          selection: { anchor: from + insert.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      endAnswer() {
        answerRangeRef.current = null;
      },
    }),
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    // Offers a non-empty selection to the menu; closing is the dismiss
    // handlers' job.
    function reportSelection(view: EditorView) {
      const { from, to } = view.state.selection.main;
      if (from === to) return;
      onSelectionMenuRef.current?.({
        ...anchorAtCursor(view),
        text: view.state.sliceDoc(from, to),
        from,
        to,
      });
    }

    const view = new EditorView({
      doc: value,
      parent: containerRef.current,
      extensions: [
        editorSetup,
        // Any click or keystroke dismisses the menu. Prec.highest and ahead of
        // the keymaps, so the close is queued before the key's own action.
        Prec.highest(
          EditorView.domEventHandlers({
            // Every button (so right-click gets out of the way for the native
            // menu). Only the primary button arms the drag.
            mousedown(event) {
              if (event.button === 0) draggingRef.current = true;
              onSelectionMenuRef.current?.(null);
              return false;
            },
            keydown() {
              onSelectionMenuRef.current?.(null);
              return false;
            },
          }),
        ),
        // Prec.highest to beat editorSetup's keymaps. Mod-j = ⌘J / Ctrl-J.
        Prec.highest(
          keymap.of([
            {
              key: "Mod-j",
              preventDefault: true,
              run(view) {
                const { from, to } = view.state.selection.main;
                onAskShortcutRef.current?.({
                  ...anchorAtCursor(view),
                  text: view.state.sliceDoc(from, to),
                  from,
                  to,
                });
                return true;
              },
            },
            // Find, with the replace row already out — ⌥⌘F / Ctrl-Alt-F, as
            // everywhere else. The caret still lands in the find field: you
            // have to say what to replace before you can say what with.
            {
              key: "Mod-Alt-f",
              preventDefault: true,
              run(view) {
                setReplaceOpen(true);
                return openSearchPanel(view);
              },
            },
          ]),
        ),
        // The find widget. CodeMirror owns the panel — opening it, closing it,
        // seeding the field from the selection, and painting the matches —
        // while [FindPanel] draws into the element it opens. `dom` is a bare
        // div for exactly that reason: it is a mounting point, not markup.
        search({
          top: true,
          createPanel(view) {
            const dom = document.createElement("div");
            return {
              dom,
              top: true,
              mount() {
                findOpenRef.current = true;
                setFind({ view, dom, state: view.state });
              },
              destroy() {
                findOpenRef.current = false;
                setFind(null);
              },
            };
          },
        }),
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        placeholderExt(placeholder ?? ""),
        appTheme,
        syntaxHighlighting(appHighlight),
        imagePasteHandler(),
        urlPasteHandler(),
        EditorView.domEventHandlers({
          click(event, view) {
            const pos = view.posAtCoords({
              x: event.clientX,
              y: event.clientY,
            });
            if (pos !== null) {
              onLineClickRef.current?.(view.state.doc.lineAt(pos).number);
            }
            // Never handled — the click still places the caret.
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          // A selection the search moved is not one the reader made, so it
          // must not raise the AI menu — stepping through eight matches would
          // otherwise pop a menu at each one. Every dispatch in
          // [lib/editor/find] is tagged for this.
          const searchMoved = update.transactions.some(
            (tr) =>
              tr.isUserEvent("select.search") || tr.isUserEvent("input.replace"),
          );

          // Keyboard selections land here; pointer ones via the mouseup listener.
          if (update.selectionSet && !draggingRef.current && !searchMoved) {
            reportSelection(update.view);
          }

          // Everything the find widget reads. Gated on the ref rather than on
          // the state, so with the widget closed — which is nearly always —
          // this costs one boolean per update instead of a React render per
          // keystroke.
          if (
            findOpenRef.current &&
            (update.docChanged ||
              update.selectionSet ||
              update.transactions.some((tr) =>
                tr.effects.some((effect) => effect.is(setSearchQuery)),
              ))
          ) {
            setFind((current) =>
              current ? { ...current, state: update.state } : current,
            );
          }

          if (update.docChanged) {
            const range = answerRangeRef.current;
            if (range) {
              // Assoc -1/1 pushes each end outward, so an edit inside the range
              // widens it rather than clipping the answer's text.
              answerRangeRef.current = {
                from: update.changes.mapPos(range.from, -1),
                to: update.changes.mapPos(range.to, 1),
              };
            }
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    viewRef.current = view;

    if (autoFocus) {
      // Caret is already at 0; just claim focus, no scrollIntoView.
      view.focus();
    }

    // On the window — a drag that releases past the editor's edge wouldn't
    // reach CodeMirror's own handlers. Gated on the drag flag.
    function onMouseUp(event: MouseEvent) {
      if (event.button !== 0 || !draggingRef.current) return;
      draggingRef.current = false;
      reportSelection(view);
    }
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally mount-once: `value` updates after this are pushed via the
    // effect below (controlled-component pattern), not by recreating the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        // Clicks inside the widget don't reach this: a portal's events travel
        // the React tree, where it is this div's sibling, not its child.
        onClick={() => viewRef.current?.focus()}
      />
      {find &&
        createPortal(
          <FindPanel
            view={find.view}
            state={find.state}
            replaceOpen={replaceOpen}
            onReplaceOpenChange={setReplaceOpen}
            preserveCase={preserveCase}
            onPreserveCaseChange={setPreserveCase}
          />,
          find.dom,
        )}
    </>
  );
}
