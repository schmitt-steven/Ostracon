"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
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

export type EditorHandle = {
  /** Scrolls the given 1-based source line into view at the top. */
  scrollToLine: (line: number) => void;
  /** Re-measures after the pane goes from hidden back to visible. */
  remeasure: () => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Fires with the 1-based line the user clicked on. */
  onLineClick?: (line: number) => void;
  placeholder?: string;
  className?: string;
  ref?: Ref<EditorHandle>;
};

export function CodeMirrorEditor({
  value,
  onChange,
  onLineClick,
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
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
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
