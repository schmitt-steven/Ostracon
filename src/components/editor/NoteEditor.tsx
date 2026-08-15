"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAiCompletion } from "@/hooks/use-ai-completion";
import { useAutosave } from "@/hooks/use-autosave";
import {
  getProviderChoice,
  getServerProviderChoice,
  setProviderChoice,
  subscribeProviderChoice,
} from "@/lib/ai/provider-choice";
import {
  NOTE_CONTEXT_LIMIT,
  type AiAction,
  type ProviderInfo,
} from "@/lib/ai/types";
import { suggestTags } from "@/lib/notes/tag-heuristic";
import { AiMenu } from "./AiMenu";
import {
  CodeMirrorEditor,
  type EditorHandle,
  type HistoryState,
  type AiAnchor,
} from "./CodeMirrorEditor";
import { HistoryControls } from "./HistoryControls";
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
  /** Overrides the mode the editor opens in (see the default below). */
  initialMode?: ViewMode;
};

export function NoteEditor({
  noteId,
  version,
  initialTitle,
  initialBodyMd,
  initialTags,
  initialPreviewHtml = "",
  initialMode,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [bodyMd, setBodyMd] = useState(initialBodyMd);
  const [tags, setTags] = useState(initialTags);
  const [suggestEnabled, setSuggestEnabled] = useState(false);
  // Opening an existing note is a reading action, so it lands on the rendered
  // side; a new note is a writing action (and has nothing to preview anyway),
  // so it lands on the writing surface.
  const [mode, setMode] = useState<ViewMode>(
    initialMode ?? (noteId ? "preview" : "write"),
  );

  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const [history, setHistory] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
  });

  const [aiMenu, setAiMenu] = useState<AiAnchor | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Held in the session store, not component state, so picking a provider once
  // holds for every note until the tab closes — see [provider-choice].
  const providerId = useSyncExternalStore(
    subscribeProviderChoice,
    getProviderChoice,
    getServerProviderChoice,
  );

  // A stored choice can name a provider this deployment doesn't offer (picked
  // LM Studio locally, then opened the deployed app). Falling back to
  // undefined lets the server choose, which matches the fallback the menu
  // already shows in its dropdown.
  const usableProviderId =
    providers?.some((p) => p.id === providerId && p.available) && providerId
      ? providerId
      : undefined;

  const { run: runAi, cancel: cancelAi, streaming } = useAiCompletion({
    onToken: (text) => editorRef.current?.insertStreamed(text),
    onDone: ({ ok, error }) => {
      editorRef.current?.endStream();
      if (!ok && error) setAiError(error);
      // The tokens arrived as document changes, so updateBody already queued
      // an autosave; flushing here just avoids waiting out the debounce on
      // what may be a large block of new text.
      if (ok) void flush();
    },
  });

  const providersRequested = useRef(false);

  // Fetched on first use rather than on mount: most note sessions never open
  // this menu, and the request is fast enough to finish while the menu shows
  // its loading state.
  const openAiMenu = useCallback((menu: AiAnchor) => {
    setAiMenu(menu);
    setAiError(null);
    if (providersRequested.current) return;
    providersRequested.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/ai");
        setProviders(res.ok ? ((await res.json()) as ProviderInfo[]) : []);
      } catch {
        // Offline, or the session expired and the fetch was redirected to the
        // login page — an empty list renders as "no provider available".
        setProviders([]);
      }
    })();
  }, []);

  // Whole-note context for a question raised at the bare cursor. Truncation
  // carries a visible marker so a clipped note reads to the model as clipped,
  // rather than as one that happens to stop mid-sentence.
  function noteContext(): string | undefined {
    const body = bodyMd.trim();
    if (!body) return undefined;
    if (body.length <= NOTE_CONTEXT_LIMIT) return body;
    return `${body.slice(0, NOTE_CONTEXT_LIMIT - 32)}\n\n…[note truncated]`;
  }

  function startAi(action: AiAction, question?: string) {
    if (!aiMenu) return;
    const editor = editorRef.current;
    if (!editor) return;

    setAiMenu(null);
    setAiError(null);
    // Insertion starts where the prompt was raised — end of the selection, or
    // the cursor — on its own blank line, so the answer reads as a new block
    // rather than running into the surrounding text.
    editor.beginStream(aiMenu.to);
    editor.insertStreamed("\n\n");
    const selection = aiMenu.text.trim();
    void runAi({
      providerId: usableProviderId,
      action,
      question,
      selection: selection || undefined,
      // Only one or the other: with something selected, that's the subject;
      // without, the note stands in.
      noteBody: selection ? undefined : noteContext(),
      noteTitle: title || undefined,
    });
  }

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
      // This swaps /notes/new for the real route, which remounts the editor
      // mid-typing — `created` keeps it on the writing surface instead of
      // letting the existing-note default drop the user into preview.
      router.replace(`/notes/${result.slug}?created=1`);
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
      {streaming && (
        <div className="flex items-center gap-3 rounded-xl border border-blue/30 bg-blue-wash px-4 py-2.5 text-sm text-blue">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue"
          />
          Generating…
          <button
            type="button"
            onClick={cancelAi}
            className="ml-auto rounded-full px-3 py-1 text-sm font-medium transition-colors hover:bg-blue hover:text-paper"
          >
            Stop
          </button>
        </div>
      )}
      {aiError && (
        <div className="flex items-start gap-3 rounded-xl border border-accent/35 bg-accent-wash px-4 py-2.5 text-sm text-ink">
          <span className="min-w-0 flex-1">{aiError}</span>
          <button
            type="button"
            onClick={() => setAiError(null)}
            className="shrink-0 text-ink-muted transition-colors hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* `group` so the lines inside the box — the toolbar's underline and the
          hairlines between the modes — can pick up the same focus swing as the
          box's own border instead of staying cream while it turns blue. */}
      <div className="group flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm shadow-ink/5 transition-colors focus-within:border-blue/50">
        <div className="flex shrink-0 border-b border-line transition-colors group-focus-within:border-blue/50">
          <HistoryControls
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => editorRef.current?.undo()}
            onRedo={() => editorRef.current?.redo()}
            dividerHidden={mode === "write"}
          />
          {/* min-w-0 so the three mode segments keep splitting whatever width
              is left over instead of pushing the buttons off the edge. */}
          <div className="min-w-0 flex-1">
            <ViewModeToggle mode={mode} onChange={setMode} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <CodeMirrorEditor
            ref={editorRef}
            value={bodyMd}
            onChange={updateBody}
            onSelectionContextMenu={openAiMenu}
            onAskShortcut={openAiMenu}
            onHistoryChange={setHistory}
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

      {aiMenu && (
        <AiMenu
          x={aiMenu.x}
          y={aiMenu.y}
          hasSelection={aiMenu.text.trim().length > 0}
          providers={providers}
          providerId={providerId}
          onProviderChange={setProviderChoice}
          onPick={startAi}
          onClose={() => setAiMenu(null)}
        />
      )}
    </div>
  );
}
