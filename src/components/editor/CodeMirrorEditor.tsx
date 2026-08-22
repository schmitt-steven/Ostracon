"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
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
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
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
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * `basicSetup` from the `codemirror` package, minus every gutter — line
 * numbers, the fold arrows beside them, the active-line gutter highlight — and
 * minus the active-line background, which on a pane with no border reads as a
 * stripe painted across the page rather than as a cursor cue.
 * Notes are prose, not code — numbered lines are noise here, and dropping the
 * gutter entirely lets the text sit flush against the editor's left edge
 * rather than leaving an empty column behind.
 *
 * Inlined because that extension is a plain array that "does not allow
 * customization"; its own docs say to copy the source and adjust it, which is
 * all this is. Everything else is verbatim, in the original order.
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
    ...searchKeymap,
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
    // Content-driven, never a fixed box. The editor grows with what's in it
    // and the pane around it scrolls — a note is as tall as it is, and the
    // 900px-tall bordered card this used to sit in was the single loudest
    // thing on the screen no matter how little was written.
    height: "auto",
  },
  // Sans, at the same 16px/1.75 the rendered side uses. The two modes are
  // then the same text in the same rhythm, one with its markup showing, which
  // is what makes Split read as one document rather than two panes.
  ".cm-content": {
    fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
    fontSize: "16px",
    lineHeight: "1.75",
    caretColor: "var(--accent)",
    padding: "0",
  },
  // The scroller has to stop scrolling for the height above to mean anything:
  // with its own overflow it would clip to whatever box it was given instead
  // of letting the content set the height.
  ".cm-scroller": {
    overflow: "visible",
    fontFamily: "inherit",
    lineHeight: "inherit",
  },
  // CodeMirror's base theme pads every line by 6px on the left and 2px on the
  // right, which would inset the text from the pane's own column.
  ".cm-line": {
    padding: "0",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  // The body has no box of its own, so nothing should draw one around it on
  // focus. Two rules would: CodeMirror's base theme rings a focused editor in
  // `1px dotted #212121`, and the app's global :focus-visible gives the
  // contenteditable an accent ring on top of that — a border appearing the
  // instant you click into the text, around a pane that has no border. The
  // caret is the cue, exactly as in the title field above.
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content:focus-visible": {
    outline: "none",
  },
  // Shown only while the note is empty. CodeMirror's own colour for it is a
  // fixed #888 picked for a white page; this is the token every other empty
  // field in the app uses, so it follows whichever theme is active and sits at
  // the same weight as the "Nothing to preview yet." line opposite it.
  ".cm-placeholder": {
    color: "var(--ink-faint)",
  },
  // Unfocused, plus the native selection in nested inputs (the search panel),
  // which CodeMirror leaves to the browser.
  ".cm-selectionBackground, ::selection": {
    backgroundColor: SELECTION_BG,
  },
  // The focused case, spelled out in full rather than as
  // `&.cm-focused .cm-selectionBackground`. drawSelection's base theme claims
  // it as `&light.cm-focused > .cm-scroller > .cm-selectionLayer
  // .cm-selectionBackground` — five classes, so the shorter selector lost to
  // it on specificity and the selection came out in CodeMirror's stock
  // lavender, its *light* default, on the dark ground. Matching the path ties
  // the specificity, and a theme outranks a base theme on ties.
  //
  // `&light` is what applies because this theme never declares itself dark:
  // that flag is fixed when the extension is built, and the app switches
  // palettes at runtime. Overriding both defaults outright is what keeps the
  // token colours right in either theme.
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: SELECTION_BG,
  },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in srgb, var(--ink) 12%, transparent)",
  },
  // editorSetup brings the search panel, which otherwise falls back to
  // CodeMirror's built-in light baseTheme and stays cream-on-cream once the
  // app is in its dark palette. Same tokens as the rest, so it follows
  // whichever theme is active — and no stroke on it, since it isn't a card.
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
  },
});

/**
 * Syntax colours for the source pane, drawn from the app's tokens.
 *
 * editorSetup ships `defaultHighlightStyle`, whose palette is a set of fixed
 * hex colours picked for a white page — link URLs come out near-navy, which is
 * unreadable once the app is in its dark theme. These are the same tokens
 * every other surface uses, so the source pane follows whichever theme is
 * active for free. Registered without `fallback`, so it takes precedence over
 * the default that editorSetup registers *with* it.
 *
 * Markdown's own tags come first and the ones for embedded fenced code after:
 * code text carries `monospace` from the markdown parser as well as its own
 * tag from the nested language, and both land on the same element, so the
 * later rule is the one that wins.
 */
const appHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--ink)", fontWeight: "600" },
  { tag: t.strong, color: "var(--ink)", fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.quote, color: "var(--ink-muted)", fontStyle: "italic" },
  // No rule for t.list on purpose. The markdown parser tags lists as
  // "BulletList/..." — the /... spreading that tag over every descendant — so
  // colouring it paints the whole item, prose included, and lands on the same
  // elements as the inline rules above. Being later in this array, it won a
  // straight cascade tie against them: bold inside a list came out accent
  // rather than ink. The bullet itself is a ListMark, which the parser tags as
  // processingInstruction, so it's still held back with the rest of the markup
  // by the rule further down.
  { tag: t.link, color: "var(--action)" },
  { tag: t.url, color: "var(--action)", textDecoration: "underline" },
  { tag: t.labelName, color: "var(--ink-muted)" },
  {
    tag: t.monospace,
    color: "var(--accent)",
    // The pane is set in sans now, so code has to say so itself.
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

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Upload failed");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

// Replaces the placeholder by searching the CURRENT document for its exact
// text rather than relying on the offsets captured at paste time: the user
// may have kept typing elsewhere while the upload was in flight, which
// would make stale offsets point at the wrong place.
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

function imagePasteHandler() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = event.clipboardData?.files;
      const imageFile = files
        ? [...files].find((f) => f.type.startsWith("image/"))
        : undefined;
      if (!imageFile) return false;

      event.preventDefault();
      const marker = `![Uploading ${imageFile.name || "image"}…]()`;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: marker },
        selection: { anchor: from + marker.length },
      });

      void uploadImage(imageFile).then(
        (url) =>
          replacePlaceholder(view, marker, `![${imageFile.name}](${url})`),
        () => replacePlaceholder(view, marker, "![Image upload failed]()"),
      );
      return true;
    },
  });
}

// Whole clipboard must be one bare URL — pasting prose that happens to
// contain a link is still a plain paste.
const URL_RE = /^(?:https?:\/\/|mailto:)\S+$/i;

// Fallback link text when nothing was selected to wrap: the bare host reads
// better in the source than the full URL repeated twice.
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
      // Pasting into the (…) of a link already being written — leave it alone,
      // wrapping there would nest one link inside another.
      if (view.state.sliceDoc(Math.max(0, from - 2), from) === "](")
        return false;

      const selected = view.state.sliceDoc(from, to).trim();
      const label = selected || labelFor(url);
      const insert = `[${label}](${url})`;

      event.preventDefault();
      view.dispatch({
        changes: { from, to, insert },
        // Caret past the link when the user supplied the label by selecting
        // it; otherwise select the host we guessed so typing replaces it.
        selection: selected
          ? { anchor: from + insert.length }
          : { anchor: from + 1, head: from + 1 + label.length },
        scrollIntoView: true,
      });
      return true;
    },
  });
}

// Anchors a popup below the selection's head — the caret when nothing is
// selected, and the moving end of a range otherwise, which is where the
// pointer (or the arrow keys) just left off. The caret has no width, so
// `coordsAtPos` is the only way to place anything against it. It returns null
// when the position isn't currently rendered (scrolled far out of view), in
// which case the editor's own top-left is a sane place to put the menu rather
// than the viewport corner.
function anchorAtCursor(view: EditorView): { x: number; y: number } {
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (coords) return { x: coords.left, y: coords.bottom };
  const box = view.dom.getBoundingClientRect();
  return { x: box.left + 16, y: box.top + 16 };
}

/**
 * Where an AI prompt was opened from. Two ways in: selecting text, or the ask
 * shortcut at the bare cursor — hence `text` may be empty, which is what
 * distinguishes "ask about this" from "ask about the note".
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
  /** Re-measures after the pane goes from hidden back to visible. */
  remeasure: () => void;
  /** Puts the caret in the document — what ⌘K's "Write" command needs. */
  focus: () => void;
  /** Appends text at the end, on its own line. Used by "Suggest tags". */
  append: (text: string) => void;
  /**
   * Claims `from`..`to` as the range an in-flight answer belongs to. The range
   * is mapped through every edit until it's used, so a note that keeps being
   * typed in while the answer streams still takes it in the right place.
   */
  beginAnswer: (from: number, to: number) => void;
  /** Writes a reviewed answer into the claimed range, then releases it. */
  applyAnswer: (text: string, placement: AnswerPlacement) => void;
  /** Releases the claimed range without writing anything. */
  endAnswer: () => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Fires with the 1-based line the user clicked on. */
  onLineClick?: (line: number) => void;
  /**
   * Drives the selection-triggered AI menu: an anchor once a non-empty
   * selection settles, null when the menu should go away (any click, any
   * keystroke). Never suppresses the native context menu.
   */
  onSelectionMenu?: (anchor: AiAnchor | null) => void;
  /** Fires on the ask shortcut (⌘J / Ctrl-J), selection or not. */
  onAskShortcut?: (anchor: AiAnchor) => void;
  placeholder?: string;
  /**
   * Puts the caret in the body as soon as the view exists, at the first
   * character — read only at mount, since that is the only moment it means
   * anything. Position 0 rather than the end of the note: it needs no reading
   * of where the user left off, it never scrolls the note away from its title
   * on arrival, and the only thing being said is "the editor is live, type".
   */
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
  // True between mousedown and mouseup inside the editor. A drag fires a
  // selection update on every mousemove, and anchoring the menu to each one
  // would have it chase the pointer across the screen — so pointer selections
  // are reported once, on release, and these interim updates are skipped.
  const draggingRef = useRef(false);

  // The range an answer under review belongs to, or null when none is in
  // flight. Mapped through every document change below, so a note edited while
  // the answer streams doesn't take it at a stale offset.
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
        // One blank line before it, unless the note is empty or already ends in
        // one — appending tags shouldn't glue them onto the last sentence.
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
      beginAnswer(from, to) {
        answerRangeRef.current = { from, to };
      },
      applyAnswer(text, placement) {
        const view = viewRef.current;
        const range = answerRangeRef.current;
        answerRangeRef.current = null;
        if (!view || !range) return;

        // "below" lands after the whole source line rather than at the exact
        // selection end: selecting half a sentence and inserting there would
        // split the paragraph around the answer, where what's wanted is a new
        // block following the paragraph the selection was taken from.
        const replacing = placement === "replace";
        const from = replacing
          ? range.from
          : view.state.doc.lineAt(range.to).to;
        const to = replacing ? range.to : from;
        const insert = replacing ? text : `\n\n${text}`;

        view.dispatch({
          changes: { from, to, insert },
          // Caret at the end of what was written, deliberately not a selection
          // over it: selecting the answer would read as a fresh highlight and
          // pop the AI menu straight back open on top of it.
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

    // Offers the current selection to the menu. Empty selections say nothing:
    // closing is the dismiss handlers' job, and staying quiet here keeps a
    // caret move from re-closing a menu the ask shortcut just opened.
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
        // Any click or keystroke dismisses the menu. Prec.highest, and ahead
        // of the keymaps below, so the close is queued before whatever the key
        // actually does — a shift-arrow that grows the selection then reopens
        // the menu from the update listener, in that order, while a plain
        // keystroke that types over the selection leaves it closed.
        Prec.highest(
          EditorView.domEventHandlers({
            // Fires for every button, so right-click is covered too: the menu
            // gets out of the way and the browser's own menu takes over,
            // unimpeded — there is no contextmenu handler any more. Only the
            // primary button arms the drag, though: right-clicking *inside* a
            // selection leaves that selection standing, and its mouseup would
            // otherwise re-open the AI menu over the native one.
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
        // Prec.highest so this wins over editorSetup's keymaps regardless of
        // extension order. Mod-j is ⌘J on macOS, Ctrl-J elsewhere.
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
          ]),
        ),
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
            // Never handled — the click still has to place the caret.
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          // Keyboard selections (shift-arrow, ⌘A) land here directly; pointer
          // ones are skipped mid-drag and reported by the mouseup listener.
          if (update.selectionSet && !draggingRef.current) {
            reportSelection(update.view);
          }

          if (update.docChanged) {
            const range = answerRangeRef.current;
            if (range) {
              // Assoc pushes each end outward — -1 holds `from` before text
              // inserted at it, 1 holds `to` after — so an edit landing inside
              // the range widens it rather than clipping the text the answer
              // was asked about.
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
      // The caret is already at 0 on a fresh state; this only claims the
      // focus. No scrollIntoView — the top of the document is where the pane
      // already is, and asking for it would fight the note's own scroll
      // position on arrival.
      view.focus();
    }

    // On the window rather than the editor: a drag that starts in the text and
    // ends past its edge — the common way to grab a trailing line — releases
    // outside, and CodeMirror's own handlers would never see it. Gated on the
    // drag flag so a click that lands in the menu itself isn't mistaken for
    // the end of a selection.
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
    <div
      ref={containerRef}
      className={className}
      onClick={() => viewRef.current?.focus()}
    />
  );
}
