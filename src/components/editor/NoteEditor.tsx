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
import { useAiCompletion, type AiRequest } from "@/hooks/use-ai-completion";
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
import {
  DEFAULT_FONT_SCALE,
  getFontScale,
  getServerFontScale,
  setFontScale,
  stepFontScale,
  subscribeFontScale,
} from "@/lib/editor/font-scale";
import { suggestTags } from "@/lib/notes/tag-heuristic";
import type { NoteRecency } from "@/lib/notes/recency";
import { RecencyTag } from "@/components/notes/RecencyTag";
import { AiAnswerCard } from "./AiAnswerCard";
import { AiMenu } from "./AiMenu";
import { FontSizeControls } from "./FontSizeControls";
import {
  CodeMirrorEditor,
  type AnswerPlacement,
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

/**
 * An answer being reviewed. The text lives here rather than in the document
 * until the user accepts it, so nothing the model wrote reaches the note
 * without being seen first.
 */
type AiAnswer = {
  /** Kept whole so Retry can re-issue the identical request. */
  request: AiRequest;
  /** Viewport coordinates the card is anchored at. */
  x: number;
  y: number;
  text: string;
};

type Props = {
  noteId: string | null;
  version: number;
  initialTitle: string;
  /**
   * What the note is called while its title is empty — the day title the
   * server will save (see [defaultNoteTitle]). Computed there and handed down
   * so the placeholder can't disagree with the title that actually lands.
   */
  defaultTitle: string;
  /**
   * The automatic tag this note carries, if any. Server-decided (see
   * [noteRecency]) and re-rendered whenever a save refreshes the route, so it
   * turns into "modified today" on the first edit of an older note without
   * this component tracking anything itself. Always null on a note that
   * hasn't been created yet.
   */
  recency: NoteRecency | null;
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
  defaultTitle,
  recency,
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
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
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

  // Who to credit the answer on the card to. An undefined provider id means
  // the request let the server choose, and it chooses the first available one
  // (see [defaultProvider]) — mirrored here so the card names a model instead
  // of going blank on exactly the common path.
  const answerProvider = answer
    ? (providers?.find(
        (p) => p.id === answer.request.providerId && p.available,
      ) ?? providers?.find((p) => p.available))
    : undefined;
  const answerProviderLabel = answerProvider
    ? `${answerProvider.label} · ${answerProvider.model}`
    : null;

  const { run: runAi, cancel: cancelAi, streaming } = useAiCompletion({
    onToken: (text) =>
      setAnswer((current) =>
        current ? { ...current, text: current.text + text } : current,
      ),
    onDone: ({ ok, error }) => {
      if (ok || !error) return;
      setAiError(error);
      // A request that failed before producing anything leaves an empty card
      // with nothing to act on, so it goes; one that failed part-way keeps
      // whatever did arrive, which is still the user's to insert or discard.
      setAnswer((current) => {
        if (current && current.text.trim()) return current;
        editorRef.current?.endAnswer();
        return null;
      });
    },
  });

  // Re-fetched every time the menu opens, not once per session: for the local
  // providers this list is live state — whether LM Studio has a model in
  // memory — and a model loaded after the first open would otherwise stay
  // invisible until a reload. The previous list stays on screen meanwhile, so
  // a re-open doesn't flash back to "Loading providers…".
  const openAiMenu = useCallback((menu: AiAnchor) => {
    setAiMenu(menu);
    setAiError(null);
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
    const selection = aiMenu.text.trim();
    const request: AiRequest = {
      providerId: usableProviderId,
      action,
      question,
      selection: selection || undefined,
      // Only one or the other: with something selected, that's the subject;
      // without, the note stands in.
      noteBody: selection ? undefined : noteContext(),
      noteTitle: title || undefined,
    };
    // The document isn't touched here — only told which range this answer is
    // about, so it can keep that range accurate while the user reads.
    editor.beginAnswer(aiMenu.from, aiMenu.to);
    setAnswer({ request, x: aiMenu.x, y: aiMenu.y, text: "" });
    void runAi(request);
  }

  function acceptAnswer(placement: AnswerPlacement) {
    const text = answer?.text.trim();
    if (!text) return;
    // Accepting part-way through is Stop-and-keep: without this the rest of
    // the generation would go on being billed and thrown away.
    cancelAi();
    editorRef.current?.applyAnswer(text, placement);
    setAnswer(null);
    // applyAnswer's dispatch runs updateBody synchronously, so the draft the
    // autosave flushes here already includes the answer; this just skips
    // waiting out the debounce on what may be a large block of new text.
    void flush();
  }

  function discardAnswer() {
    cancelAi();
    editorRef.current?.endAnswer();
    setAnswer(null);
  }

  function retryAnswer() {
    if (!answer) return;
    setAiError(null);
    setAnswer({ ...answer, text: "" });
    void runAi(answer.request);
  }

  // Same store shape as the provider choice above, and for the same reason —
  // it has to outlive the editor being remounted on every navigation.
  const fontScale = useSyncExternalStore(
    subscribeFontScale,
    getFontScale,
    getServerFontScale,
  );

  // display:none leaves CodeMirror with stale measurements; re-measure when
  // the pane comes back rather than tearing the view (and its undo history)
  // down on every mode switch. A font-size change invalidates exactly the same
  // measurements — CodeMirror caches character width to place the cursor and
  // decide where lines wrap — so it re-measures on the same effect.
  useEffect(() => {
    if (mode !== "preview") editorRef.current?.remeasure();
  }, [mode, fontScale]);

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
        placeholder={defaultTitle}
        // Inputs clip to their line box, and Fraunces' descenders overflow
        // the default text-4xl leading — hence the roomier line-height.
        //
        // The global :focus-visible rule would box this borderless field in an
        // accent ring — text inputs match :focus-visible on click too, so it
        // shows up the moment you start titling a note. The caret in 4xl
        // display type is affordance enough. That rule is unlayered, so it
        // outranks any utility layer regardless of specificity — hence the `!`
        // (same as [TagEditor]).
        className="w-full bg-transparent font-display text-4xl font-semibold leading-[1.35] tracking-tight text-ink outline-none focus-visible:outline-none!"
      />
      <SaveToast status={status} onSave={() => void flush()} />
      <div className="flex items-start gap-3">
        {/* Sized to the pills in TagEditor rather than the list's smaller
            ones, so the tag row reads as one row of tags. */}
        <RecencyTag
          recency={recency}
          className="shrink-0 px-3.5 py-1.5 text-sm"
        />
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
              className="rounded-full border border-dashed border-line-strong px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-action hover:bg-action-wash hover:text-action"
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
              className="rounded-full bg-action px-4 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-action-hover"
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
      {/* Every line in this box stays --line whatever has focus. The border and
          the hairlines inside it used to swing to --action together on
          focus-within; the editor holds focus for as long as you're writing, so
          what was meant as a focus cue just read as the frame being lit up the
          entire time. No `group` here any more for the same reason — nothing
          inside is keyed to this box's focus state now.

          The scale lands here rather than on either pane: both of them read it,
          and setting it on their shared box is what keeps the raw markdown and
          the rendered preview in step with each other in split view. Cast
          because React's CSSProperties doesn't admit custom properties. */}
      <div
        style={
          { "--editor-font-scale": fontScale / 100 } as React.CSSProperties
        }
        className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm shadow-shade/5 transition-colors"
      >
        <div className="flex shrink-0 border-b border-line transition-colors">
          <HistoryControls
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => editorRef.current?.undo()}
            onRedo={() => editorRef.current?.redo()}
          />
          {/* min-w-0 so the three mode segments keep splitting whatever width
              is left over instead of pushing the buttons off the edge. */}
          <div className="min-w-0 flex-1">
            <ViewModeToggle mode={mode} onChange={setMode} />
          </div>
          <FontSizeControls
            scale={fontScale}
            onStep={stepFontScale}
            onReset={() => setFontScale(DEFAULT_FONT_SCALE)}
          />
        </div>
        <div className="flex min-h-0 flex-1">
          <CodeMirrorEditor
            ref={editorRef}
            value={bodyMd}
            onChange={updateBody}
            // Both entry points stand down while an answer is under review:
            // the menu is anchored at the same selection as the card, so it
            // would open on top of it, and there's one decision to make at a
            // time — accept this answer, or discard it and ask again.
            onSelectionMenu={(anchor) => {
              if (answer) return;
              if (anchor) openAiMenu(anchor);
              else setAiMenu(null);
            }}
            onAskShortcut={(anchor) => {
              if (!answer) openAiMenu(anchor);
            }}
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

      {answer && (
        <AiAnswerCard
          x={answer.x}
          y={answer.y}
          action={answer.request.action}
          question={answer.request.question}
          providerLabel={answerProviderLabel}
          text={answer.text}
          streaming={streaming}
          canReplace={Boolean(answer.request.selection)}
          // Rewriting is an edit to the selection, so it replaces it; the
          // other three are additions, and overwriting what was asked about
          // would throw away the thing the answer refers to.
          defaultPlacement={
            answer.request.action === "rewrite" && answer.request.selection
              ? "replace"
              : "below"
          }
          onInsert={acceptAnswer}
          onRetry={retryAnswer}
          onStop={cancelAi}
          onDiscard={discardAnswer}
        />
      )}
    </div>
  );
}
