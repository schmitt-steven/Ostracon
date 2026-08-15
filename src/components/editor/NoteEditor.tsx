"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAutosave } from "@/hooks/use-autosave";
import { suggestTags } from "@/lib/notes/tag-heuristic";
import { CodeMirrorEditor, type EditorHandle } from "./CodeMirrorEditor";
import { PreviewPane, type PreviewHandle } from "./PreviewPane";
import { SaveToast } from "./SaveToast";
import { TagEditor } from "./TagEditor";
import { TagSuggestToggle } from "./TagSuggestToggle";
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";

type Props = {
  noteId: string | null;
  version: number;
  initialTitle: string;
  initialBodyMd: string;
  initialTags: string[];
  /** Server-rendered HTML of `initialBodyMd`; empty for a brand-new note. */
  initialPreviewHtml?: string;
};

export function NoteEditor({
  noteId,
  version,
  initialTitle,
  initialBodyMd,
  initialTags,
  initialPreviewHtml = "",
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [bodyMd, setBodyMd] = useState(initialBodyMd);
  const [tags, setTags] = useState(initialTags);
  const [suggestEnabled, setSuggestEnabled] = useState(false);
  // An existing note opens split (that's what the old page showed); an empty
  // new note has nothing to preview, so it opens on the writing surface.
  const [mode, setMode] = useState<ViewMode>(initialBodyMd ? "split" : "write");

  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);

  // display:none leaves CodeMirror with stale measurements; re-measure when
  // the pane comes back rather than tearing the view (and its undo history)
  // down on every mode switch.
  useEffect(() => {
    if (mode !== "preview") editorRef.current?.remeasure();
  }, [mode]);

  const { status, conflict, scheduleSave, flush, keepMine } = useAutosave({
    initialNoteId: noteId,
    initialVersion: version,
    onCreated: (result) => {
      router.replace(`/notes/${result.slug}`);
    },
  });

  function updateTitle(value: string) {
    setTitle(value);
    scheduleSave({ title: value, bodyMd, tags });
  }

  function updateBody(value: string) {
    setBodyMd(value);
    scheduleSave({ title, bodyMd: value, tags });
  }

  function updateTags(next: string[]) {
    setTags(next);
    scheduleSave({ title, bodyMd, tags: next });
  }

  function acceptSuggestedTag(tag: string) {
    updateTags([...tags, tag]);
  }

  // suggestTags is a pure, synchronous local computation (no network) — no
  // need to piggyback on the autosave debounce, useMemo recomputing on
  // every relevant keystroke is already free.
  const suggestedTags = useMemo(() => {
    if (!suggestEnabled) return [];
    const current = new Set(tags);
    return suggestTags(`${title}\n${bodyMd}`).filter((t) => !current.has(t));
  }, [suggestEnabled, title, bodyMd, tags]);

  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Only flush when focus leaves the editor entirely — not when it just
    // hops between the title/tags/body fields inside it (every such hop
    // fires a blur too, and flushing there raced note-creation against
    // still-empty fields the user hadn't reached yet).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      void flush();
    }
  }

  return (
    <div className="flex h-full flex-col gap-4" onBlur={handleContainerBlur}>
      <input
        value={title}
        onChange={(e) => updateTitle(e.target.value)}
        placeholder="Untitled note"
        // Inputs clip to their line box, and Fraunces' descenders overflow
        // the default text-4xl leading — hence the roomier line-height.
        className="w-full bg-transparent font-display text-4xl font-semibold leading-[1.35] tracking-tight text-ink outline-none"
      />
      <SaveToast status={status} onSave={() => void flush()} />
      <div className="flex items-start gap-3">
        <TagEditor tags={tags} onChange={updateTags} />
        <TagSuggestToggle enabled={suggestEnabled} onChange={setSuggestEnabled} />
      </div>
      {suggestEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          {suggestedTags.length === 0 && (
            // Without this the toggle looks broken when nothing matches.
            <p className="text-sm text-ink-faint">
              No tags to suggest for this note yet — keep writing ;)
            </p>
          )}
          {suggestedTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => acceptSuggestedTag(tag)}
              className="rounded-full border border-dashed border-line-strong px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-blue hover:bg-blue-wash hover:text-blue"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
      {conflict && (
        <div className="rounded-xl border border-accent/35 bg-accent-wash px-5 py-4 text-base text-ink">
          This note changed in another tab (last saved{" "}
          {new Date(conflict.updatedAt).toLocaleTimeString()}).
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void keepMine()}
              className="rounded-full bg-blue px-4 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-blue-hover"
            >
              Keep mine
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full border border-line-strong px-4 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink hover:text-ink"
            >
              Reload theirs
            </button>
          </div>
        </div>
      )}
      {/* One box for both sides: the toolbar is a row inside it, and split
          mode divides the body with a hairline rather than a second card. */}
      <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm shadow-ink/5 transition-colors focus-within:border-blue/50">
        <div className="flex shrink-0 items-center border-b border-line px-3 py-2">
          <ViewModeToggle mode={mode} onChange={setMode} />
        </div>
        <div className="flex min-h-0 flex-1">
          <CodeMirrorEditor
            ref={editorRef}
            value={bodyMd}
            onChange={updateBody}
            // Clicking a line in the source scrolls the rendered side to the
            // block it produced (split only — nothing to sync otherwise).
            onLineClick={(line) => {
              if (mode === "split") previewRef.current?.scrollToLine(line);
            }}
            placeholder="Write in markdown…"
            className={`${mode === "preview" ? "hidden " : ""}min-w-0 flex-1 overflow-hidden`}
          />
          {mode === "split" && (
            <div aria-hidden className="w-px shrink-0 bg-line" />
          )}
          <PreviewPane
            ref={previewRef}
            bodyMd={bodyMd}
            initialHtml={initialPreviewHtml}
            initialBodyMd={initialBodyMd}
            active={mode !== "write"}
            onLineClick={(line) => {
              if (mode === "split") editorRef.current?.scrollToLine(line);
            }}
            className={`${mode === "write" ? "hidden " : ""}min-w-0 flex-1`}
          />
        </div>
      </div>
    </div>
  );
}
