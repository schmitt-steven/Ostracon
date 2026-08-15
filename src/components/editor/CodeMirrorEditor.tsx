"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, placeholder as placeholderExt } from "@codemirror/view";
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
});

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

export type SelectionContextMenu = {
  /** Viewport coordinates of the click, for positioning the menu. */
  x: number;
  y: number;
  text: string;
  /** End of the selection — where generated text gets inserted. */
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
  onSelectionContextMenu?: (menu: SelectionContextMenu) => void;
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
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        placeholderExt(placeholder ?? ""),
        appTheme,
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
