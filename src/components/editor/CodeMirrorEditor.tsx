"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "codemirror";

const appTheme = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "transparent",
    height: "100%",
    fontSize: "15.5px",
  },
  ".cm-content": {
    fontFamily: "var(--font-plex-mono, monospace)",
    caretColor: "var(--accent)",
    paddingTop: "1rem",
    paddingBottom: "1rem",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--ink-faint)",
    border: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent) 5%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--accent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in srgb, var(--ink) 12%, transparent)",
  },
  // basicSetup brings the search panel and autocomplete tooltips, which
  // otherwise fall back to CodeMirror's built-in light baseTheme and stay
  // cream-on-cream once the app is in its dark palette. Same tokens as the
  // rest, so they follow whichever theme is active.
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--line)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--line)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
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
 * basicSetup ships `defaultHighlightStyle`, whose palette is a set of fixed
 * hex colours picked for a white page — link URLs come out near-navy, which is
 * unreadable once the app is in its dark theme. These are the same tokens
 * every other surface uses, so the source pane follows whichever theme is
 * active for free. Registered without `fallback`, so it takes precedence over
 * the default that basicSetup registers *with* it.
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
  { tag: t.list, color: "var(--accent)" },
  { tag: t.link, color: "var(--blue)" },
  { tag: t.url, color: "var(--blue)", textDecoration: "underline" },
  { tag: t.labelName, color: "var(--ink-muted)" },
  { tag: t.monospace, color: "var(--accent)" },
  { tag: t.escape, color: "var(--ink-faint)" },
  { tag: t.character, color: "var(--accent)" },
  { tag: t.contentSeparator, color: "var(--ink-faint)" },
  // The markup itself — #, *, backticks, list bullets, link brackets. Held
  // back so the text reads over its own punctuation.
  { tag: t.processingInstruction, color: "var(--ink-faint)" },

  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: "var(--blue)" },
  { tag: [t.operator, t.derefOperator], color: "var(--ink-muted)" },
  { tag: [t.string, t.regexp, t.special(t.string)], color: "var(--green)" },
  { tag: [t.number, t.bool, t.atom, t.null], color: "var(--accent)" },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: "var(--accent-hover)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--ink)" },
  { tag: t.function(t.variableName), color: "var(--blue-hover)" },
  { tag: t.comment, color: "var(--ink-faint)", fontStyle: "italic" },
  { tag: t.invalid, color: "var(--danger)" },
]);

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Upload failed");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

// Replaces the placeholder by searching the CURRENT document for its exact
// text rather than relying on the offsets captured at paste time: the user
// may have kept typing elsewhere while the upload was in flight, which
// would make stale offsets point at the wrong place.
function replacePlaceholder(view: EditorView, marker: string, replacement: string) {
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
        (url) => replacePlaceholder(view, marker, `![${imageFile.name}](${url})`),
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
      if (view.state.sliceDoc(Math.max(0, from - 2), from) === "](") return false;

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

// The caret has no width, so `coordsAtPos` is the only way to anchor a popup
// to it. It returns null when the position isn't currently rendered (scrolled
// far out of view), in which case the editor's own top-left is a sane place to
// put the menu rather than the viewport corner.
function anchorAtCursor(view: EditorView): { x: number; y: number } {
  const coords = view.coordsAtPos(view.state.selection.main.head);
  if (coords) return { x: coords.left, y: coords.bottom };
  const box = view.dom.getBoundingClientRect();
  return { x: box.left + 16, y: box.top + 16 };
}

// Clicking a toolbar button moves focus out of the editor, so hand it back
// afterwards: the caret CodeMirror just restored is where the user wants to
// resume typing, and ⌘Z has to keep working without a click into the text.
function runHistoryCommand(
  view: EditorView | null,
  command: (view: EditorView) => boolean,
) {
  if (!view) return;
  command(view);
  view.focus();
}

/**
 * Where an AI prompt was opened from. Two ways in: right-clicking a selection,
 * or the ask shortcut at the bare cursor — hence `text` may be empty, which is
 * what distinguishes "ask about this" from "ask about the note".
 */
export type AiAnchor = {
  /** Viewport coordinates to position the menu at. */
  x: number;
  y: number;
  /** The selected text; empty when opened from the cursor. */
  text: string;
  /** Where generated text gets inserted — selection end, or the cursor. */
  to: number;
};

/** Whether each direction has anything left to step through. */
export type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};

export type EditorHandle = {
  /** Scrolls the given 1-based source line into view at the top. */
  scrollToLine: (line: number) => void;
  /** Re-measures after the pane goes from hidden back to visible. */
  remeasure: () => void;
  /** Same history as ⌘Z / ⇧⌘Z — the keymap and these share one undo stack. */
  undo: () => void;
  redo: () => void;
  /**
   * Opens a streaming insertion point at `pos`. Subsequent `insertStreamed`
   * calls append there, and the point survives edits made in the meantime.
   */
  beginStream: (pos: number) => void;
  insertStreamed: (text: string) => void;
  endStream: () => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Fires with the 1-based line the user clicked on. */
  onLineClick?: (line: number) => void;
  /** Fires on right-click when text is selected; suppresses the native menu. */
  onSelectionContextMenu?: (anchor: AiAnchor) => void;
  /** Fires on the ask shortcut (⌘J / Ctrl-J), selection or not. */
  onAskShortcut?: (anchor: AiAnchor) => void;
  /** Fires only when a direction flips between empty and non-empty. */
  onHistoryChange?: (history: HistoryState) => void;
  placeholder?: string;
  className?: string;
  ref?: Ref<EditorHandle>;
};

export function CodeMirrorEditor({
  value,
  onChange,
  onLineClick,
  onSelectionContextMenu,
  onAskShortcut,
  onHistoryChange,
  placeholder,
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
  const onContextMenuRef = useRef(onSelectionContextMenu);
  useEffect(() => {
    onContextMenuRef.current = onSelectionContextMenu;
  }, [onSelectionContextMenu]);
  const onAskShortcutRef = useRef(onAskShortcut);
  useEffect(() => {
    onAskShortcutRef.current = onAskShortcut;
  }, [onAskShortcut]);
  const onHistoryChangeRef = useRef(onHistoryChange);
  useEffect(() => {
    onHistoryChangeRef.current = onHistoryChange;
  }, [onHistoryChange]);

  // Last values reported upward. The update listener runs on every keystroke
  // and every cursor move, but the buttons only care about the empty/non-empty
  // flip, so anything else would be a re-render of the whole editor for nothing.
  const historyRef = useRef<HistoryState>({ canUndo: false, canRedo: false });

  // Where streamed text is currently being appended, or null when no
  // generation is in flight. Mapped through every document change below, so
  // typing elsewhere mid-stream doesn't send tokens to the wrong offset.
  const streamPosRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToLine(line) {
      const view = viewRef.current;
      if (!view) return;
      const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.doc.line(clamped).from, {
          y: "start",
          yMargin: 16,
        }),
      });
    },
    remeasure() {
      viewRef.current?.requestMeasure();
    },
    undo() {
      runHistoryCommand(viewRef.current, undo);
    },
    redo() {
      runHistoryCommand(viewRef.current, redo);
    },
    beginStream(pos) {
      streamPosRef.current = pos;
    },
    insertStreamed(text) {
      const view = viewRef.current;
      const pos = streamPosRef.current;
      if (!view || pos === null) return;
      // No explicit advance of streamPosRef: the update listener maps it
      // through this very change, which moves it past the inserted text.
      view.dispatch({
        changes: { from: pos, insert: text },
        scrollIntoView: true,
      });
    },
    endStream() {
      streamPosRef.current = null;
    },
  }), []);

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      doc: value,
      parent: containerRef.current,
      extensions: [
        basicSetup,
        // Prec.highest so this wins over basicSetup's keymaps regardless of
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
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos !== null) {
              onLineClickRef.current?.(view.state.doc.lineAt(pos).number);
            }
            // Never handled — the click still has to place the caret.
            return false;
          },
          contextmenu(event, view) {
            const { from, to } = view.state.selection.main;
            // With no selection there's nothing to ask about, so the browser's
            // own menu (spellcheck, paste) stays available.
            if (from === to) return false;
            event.preventDefault();
            onContextMenuRef.current?.({
              x: event.clientX,
              y: event.clientY,
              text: view.state.sliceDoc(from, to),
              to,
            });
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          // Not gated on docChanged: undo() itself empties the undo stack
          // without the document differing from where redo would put it back.
          const canUndo = undoDepth(update.state) > 0;
          const canRedo = redoDepth(update.state) > 0;
          const previous = historyRef.current;
          if (canUndo !== previous.canUndo || canRedo !== previous.canRedo) {
            historyRef.current = { canUndo, canRedo };
            onHistoryChangeRef.current?.(historyRef.current);
          }

          if (update.docChanged) {
            if (streamPosRef.current !== null) {
              // assoc 1 keeps the point after text inserted at it, so our own
              // streamed tokens append in order instead of stacking backwards.
              streamPosRef.current = update.changes.mapPos(
                streamPosRef.current,
                1,
              );
            }
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    viewRef.current = view;

    return () => {
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
