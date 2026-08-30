"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PaneScroller } from "@/components/shell/PaneScroller";
import { RelativeDate } from "@/components/ui/RelativeDate";
import { useAiCompletion, type AiRequest } from "@/hooks/use-ai-completion";
import { useAutosave } from "@/hooks/use-autosave";
import { useCompactViewport } from "@/hooks/use-compact-viewport";
import { useTagHues } from "@/hooks/use-tag-hues";
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
import { registerCommands } from "@/lib/command/registry";
import { registerImageTarget } from "@/lib/images/insert-target";
import {
  describeSkippedImages,
  IMAGE_ACCEPT,
  validateImageBatch,
} from "@/lib/images/upload-rules";
import type { Backlink } from "@/lib/notes/queries";
import { suggestTags } from "@/lib/notes/tag-heuristic";
import { normalizeTagList } from "@/lib/tags/parse";
import {
  ALL_NOTES_HREF,
  noteHref,
  resolveContextTag,
  tagHref,
} from "@/lib/tags/routes";
import { washLights, washVars } from "@/lib/tags/wash";
import { AiAnswerCard } from "./AiAnswerCard";
import { AiMenu } from "./AiMenu";
import {
  CodeMirrorEditor,
  type AnswerPlacement,
  type EditorHandle,
  type AiAnchor,
} from "./CodeMirrorEditor";
import { NoteDeleteButton } from "./NoteDeleteButton";
import { NotePinButton } from "./NotePinButton";
import { PreviewPane, type PreviewHandle } from "./PreviewPane";
import { SaveToast } from "./SaveToast";
import { TagBar } from "./TagBar";
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
  /** The day title the server will save for an empty title (see
   * [defaultNoteTitle]), so the placeholder matches. */
  defaultTitle: string;
  initialBodyMd: string;
  /** The note's tags, as filed. Edited in the tag bar, never in the body. */
  initialTags: string[];
  /** The index this note was opened from, off the query string; validated in
   * [resolveContextTag]. Absent when there's no index behind it. */
  openedFrom?: string;
  /** Server-rendered HTML of `initialBodyMd`; empty for a brand-new note. */
  initialPreviewHtml?: string;
  /** Whether the note is pinned to the rail. False for one not yet created. */
  pinned: boolean;
  /** Last save, as the server knows it. Refreshed locally after each save. */
  updatedAt: string;
  backlinks: Backlink[];
  /** Every tag in the collection. What the tag bar suggests from. */
  allTags: string[];
};

// Text column width. 680px reading measure; split gets 1100px for its two
// half-measure columns.
const COLUMN: Record<ViewMode, string> = {
  write: "max-w-[680px]",
  preview: "max-w-[680px]",
  split: "max-w-[1100px]",
};

/** Words, for the metadata line. Cheap enough to run on every keystroke. */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * The single-note view. The pane is lit by the note's own tags (see
 * lib/tags/wash and `.pane` in globals.css). No card, no toolbar — title,
 * metadata line and body are three blocks of text on one surface.
 */
export function NoteEditor({
  noteId,
  version,
  initialTitle,
  defaultTitle,
  initialBodyMd,
  initialTags,
  openedFrom,
  initialPreviewHtml = "",
  pinned,
  updatedAt,
  backlinks,
  allTags,
}: Props) {
  const router = useRouter();
  const { hueOf } = useTagHues();
  // Narrow screens have two modes, not three — see [ViewModeToggle].
  const compact = useCompactViewport();
  const [title, setTitle] = useState(initialTitle);
  const [bodyMd, setBodyMd] = useState(initialBodyMd);
  const [tags, setTags] = useState(initialTags);
  // The id the note has now — the prop for an existing note, or the first
  // save's result held here so id-dependent controls can appear in place (see
  // the autosave's onCreated).
  const [savedId, setSavedId] = useState(noteId);
  // True once this editor swapped its own URL (below) — a router refresh would
  // then unmount it, so actions reachable from here are told to hold off. See
  // `canRefreshShell` in notes/actions.
  const [urlSwapped, setUrlSwapped] = useState(false);
  // Every note opens on the writing surface; preview is a mode you ask for.
  const [chosenMode, setMode] = useState<ViewMode>("write");
  // A narrow screen has no room for split — derived, not written back, so a
  // window widened again returns to the chosen mode.
  const mode = compact && chosenMode === "split" ? "write" : chosenMode;
  const [showBacklinks, setShowBacklinks] = useState(false);

  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  /** Why some images didn't make it — too big, wrong format, too many. */
  const [imageNotice, setImageNotice] = useState<string | null>(null);

  const [aiMenu, setAiMenu] = useState<AiAnchor | null>(null);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const words = useMemo(() => countWords(bodyMd), [bodyMd]);

  // The tag this note is read *under* — what the breadcrumb names and Escape
  // returns to. The index you came from, not a note property; falls back to
  // the first tag. Recomputed against `tags` so removing it drops the
  // breadcrumb to the fallback.
  const contextTag = useMemo(
    () => resolveContextTag(openedFrom, tags),
    [openedFrom, tags],
  );

  // The pane wash (see lib/tags/wash) — the note's tags in filed order. The
  // context tag isn't promoted; it only reordered lights, never added a hue.
  // `--h` rides along for the pane's per-tag pills and links.
  const paneStyle = useMemo(() => {
    const vars: Record<string, string> = washVars(washLights(tags, hueOf));
    if (contextTag) vars["--h"] = String(hueOf(contextTag));
    return vars as React.CSSProperties;
  }, [contextTag, hueOf, tags]);

  // Run on press, not per keystroke — the heuristic scans the whole note.
  const suggestForNote = useCallback(
    () => suggestTags(`${title}\n${bodyMd}`).slice(0, 5),
    [bodyMd, title],
  );

  // Held in the session store, not component state, so picking a provider once
  // holds for every note until the tab closes — see [provider-choice].
  const providerId = useSyncExternalStore(
    subscribeProviderChoice,
    getProviderChoice,
    getServerProviderChoice,
  );

  // A stored choice can name a provider this deployment doesn't offer;
  // undefined lets the server choose, matching the menu's own fallback.
  const usableProviderId =
    providers?.some((p) => p.id === providerId && p.available) && providerId
      ? providerId
      : undefined;

  // Who to credit on the card. Mirrors the server's "first available" default
  // (see [defaultProvider]) so the card names a model on the common path.
  const answerProvider = answer
    ? (providers?.find(
        (p) => p.id === answer.request.providerId && p.available,
      ) ?? providers?.find((p) => p.available))
    : undefined;
  const answerProviderLabel = answerProvider
    ? `${answerProvider.label} · ${answerProvider.model}`
    : null;

  const {
    run: runAi,
    cancel: cancelAi,
    streaming,
  } = useAiCompletion({
    onToken: (text) =>
      setAnswer((current) =>
        current ? { ...current, text: current.text + text } : current,
      ),
    onDone: ({ ok, error }) => {
      if (ok || !error) return;
      setAiError(error);
      // Keep a part-way answer to act on; drop an empty one.
      setAnswer((current) => {
        if (current && current.text.trim()) return current;
        editorRef.current?.endAnswer();
        return null;
      });
    },
  });

  // Re-fetched each time the menu opens — the local providers' state is live.
  const openAiMenu = useCallback((menu: AiAnchor) => {
    setAiMenu(menu);
    setAiError(null);
    void (async () => {
      try {
        const res = await fetch("/api/ai");
        setProviders(res.ok ? ((await res.json()) as ProviderInfo[]) : []);
      } catch {
        // Offline or expired session — empty list renders as "none available".
        setProviders([]);
      }
    })();
  }, []);

  // Whole-note context for a bare-cursor question, with a visible truncation
  // marker so the model reads a clipped note as clipped.
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
      // Selection is the subject if there is one; otherwise the note stands in.
      noteBody: selection ? undefined : noteContext(),
      noteTitle: title || undefined,
    };
    // The document isn't touched — just told which range the answer is about.
    editor.beginAnswer(aiMenu.from, aiMenu.to);
    setAnswer({ request, x: aiMenu.x, y: aiMenu.y, text: "" });
    void runAi(request);
  }

  const { status, conflict, scheduleSave, flush, keepMine } = useAutosave({
    initialNoteId: noteId,
    initialVersion: version,
    onCreated: (result) => {
      setSavedId(result.id);
      // history.replaceState, not router.replace: /notes/new and
      // /notes/[slug] are different segments, so navigating would unmount this
      // editor mid-typing. replaceState runs no routing; the App Router keeps
      // usePathname in step and the editor stays put. The slug is fixed at
      // creation (see notes/actions). No `from` — a new note has no index.
      window.history.replaceState(null, "", noteHref(result.slug));
      setUrlSwapped(true);
    },
  });

  function acceptAnswer(placement: AnswerPlacement) {
    const text = answer?.text.trim();
    if (!text) return;
    // Accepting part-way is Stop-and-keep — otherwise the rest is billed and
    // discarded.
    cancelAi();
    editorRef.current?.applyAnswer(text, placement);
    setAnswer(null);
    // applyAnswer runs updateBody synchronously; this just skips the debounce.
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

  // The metadata line's "Edited …" — the prop goes stale on save, so each save
  // stamps a fresh one.
  const [editedAt, setEditedAt] = useState(updatedAt);
  const [savesThisSession, setSavesThisSession] = useState(0);
  const wasSaving = useRef(false);
  useEffect(() => {
    if (status === "saving") {
      wasSaving.current = true;
    } else if (status === "saved" && wasSaving.current) {
      wasSaving.current = false;
      setEditedAt(new Date().toISOString());
      setSavesThisSession((count) => count + 1);
    }
  }, [status]);

  function updateTitle(value: string) {
    setTitle(value);
    scheduleSave({ title: value, bodyMd, tags });
  }

  function updateBody(value: string) {
    setBodyMd(value);
    scheduleSave({ title, bodyMd: value, tags });
  }

  // Memoised (unlike updateTitle/updateBody) so the ⌘K command closing over it
  // doesn't re-register per keystroke.
  const updateTags = useCallback(
    (value: string[]) => {
      const next = normalizeTagList(value);
      setTags(next);
      scheduleSave({ title, bodyMd, tags: next });
    },
    [bodyMd, scheduleSave, title],
  );

  // A note seeded with a title or tag (palette "New note titled …", a broken
  // wikilink) is written immediately — the naming was the act of creating it.
  // A bare /notes/new stays lazy, so an opened-and-abandoned palette files
  // nothing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (noteId !== null) return;
    if (!initialTitle && initialTags.length === 0) return;
    scheduleSave({
      title: initialTitle,
      bodyMd: initialBodyMd,
      tags: initialTags,
    });
  }, [initialBodyMd, initialTags, initialTitle, noteId, scheduleSave]);

  // display:none leaves CodeMirror with stale measurements — re-measure rather
  // than tear the view (and its undo history) down on every mode switch.
  useEffect(() => {
    if (mode !== "preview") editorRef.current?.remeasure();
  }, [mode]);

  // A new note opens focused in the title, caret at the end of any seeded name.
  useEffect(() => {
    if (noteId !== null) return;
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    // Mount-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit the title textarea to its wrapped text on every change.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  // Escape goes to the note's index (the breadcrumb's tag destination) —
  // deterministic, unlike history.back().
  const backHref = contextTag ? tagHref(contextTag) : ALL_NOTES_HREF;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      // Escape in the editor/title/a dialog belongs to that control.
      if (target?.closest(".cm-editor, input, textarea, [role='dialog']")) {
        return;
      }
      router.push(backHref);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [backHref, router]);

  // Images, dropped or picked. Validated here (the editor has nowhere to
  // report a rejected file); it receives an already-uploadable list.
  const addImages = useCallback(
    (files: File[], at?: { x: number; y: number }) => {
      const { accepted, skipped, refusal } = validateImageBatch(files);
      setImageNotice(refusal ?? describeSkippedImages(skipped));
      if (accepted.length > 0) editorRef.current?.insertImages(accepted, at);
    },
    [],
  );

  // Claims the window's image drops for this note (see lib/images/insert-target).
  useEffect(() => registerImageTarget(addImages), [addImages]);

  // The one ⌘K command — it has no on-screen button (there's no upload button
  // by design), so without this row the only way in is the drag gesture.
  useEffect(
    () =>
      registerCommands([
        {
          id: "add-images",
          label: "Add images",
          group: "Editor",
          detail: "Upload images into this note · or drop them on it",
          keywords: "image images upload picture photo screenshot png jpg attach",
          icon: "image",
          // Synchronous inside the palette's gesture, or the dialog won't open.
          run: () => imageInputRef.current?.click(),
        },
      ]),
    [],
  );

  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Only when focus leaves the editor entirely, not on title↔body hops.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      void flush();
    }
  }

  // The untagged nudge fires only after a few saves — "you've come back to it".
  const showTagNudge =
    savedId !== null &&
    tags.length === 0 &&
    version + savesThisSession >= 3 &&
    bodyMd.trim().length > 0;

  return (
    <div className="pane pane-etched h-full" style={paneStyle}>
      {/* The header goes glass only once something scrolls behind it — over a
          wash there's no flat tint to match. See .pane-head. */}
      <PaneScroller
        onBlur={handleContainerBlur}
        head={
          <header className="pane-head">
            <div
              className={`mx-auto flex min-h-[var(--head-h)] items-center gap-3 px-6 py-4 ${COLUMN[mode]}`}
            >
              {/* min-w-0 lets the title segment ellipsise instead of widening
                the row; -ml-1.5 cancels the first pill's padding so the word
                "All notes" lines up with the title. */}
              <nav
                aria-label="Breadcrumb"
                className="-ml-1.5 flex min-w-0 flex-1 items-center text-[13px]"
              >
                {/* The same pill the tags get, so a tag reads alike anywhere. */}
                <Link
                  href={ALL_NOTES_HREF}
                  className="tag-pill tag-pill-ink shrink-0 rounded-full px-1.5 py-1 text-ink-muted"
                >
                  All notes
                </Link>
                {contextTag && (
                  <>
                    <span aria-hidden className="text-ink-faint">
                      /
                    </span>
                    {/* The way back — there's no back button; Escape matches it. */}
                    <Link
                      href={tagHref(contextTag)}
                      style={
                        { "--h": hueOf(contextTag) } as React.CSSProperties
                      }
                      className="tag-pill hue-text shrink-0 rounded-full px-1.5 py-1"
                    >
                      #{contextTag}
                    </Link>
                  </>
                )}
                <span aria-hidden className="text-ink-faint">
                  /
                </span>
                <span className="min-w-0 truncate px-1.5 text-ink">
                  {title || defaultTitle}
                </span>
              </nav>
              <ViewModeToggle mode={mode} onChange={setMode} />
              {/* Both only once the note has an id (from the first save). */}
              {savedId && (
                <>
                  <NotePinButton
                    noteId={savedId}
                    title={title}
                    pinned={pinned}
                    canRefreshShell={!urlSwapped}
                  />
                  <NoteDeleteButton noteId={savedId} title={title} />
                </>
              )}
            </div>
          </header>
        }
      >
        <div className={`mx-auto px-6 pb-32 ${COLUMN[mode]}`}>
          <textarea
            ref={titleRef}
            // A textarea so a long title wraps; rows=1 + the grow effect keeps
            // it one field, and Enter commits to the body.
            rows={1}
            value={title}
            // Strip pasted newlines — a title is one line however it arrives.
            onChange={(e) =>
              updateTitle(e.target.value.replace(/\s*\n+\s*/g, " "))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder={defaultTitle}
            aria-label="Note title"
            // The global :focus-visible ring would box this borderless field;
            // the caret in 28px display type is affordance enough. `!` beats
            // the unlayered rule.
            className="mt-2 w-full resize-none overflow-hidden bg-transparent font-display text-[28px] font-medium leading-[1.3] text-ink outline-none focus-visible:outline-none!"
          />

          {/* One plain line — the note's facts as a sentence, no badges. */}
          <p className="mt-[var(--space-hair)] text-[13px] text-ink-muted">
            Edited <RelativeDate date={editedAt} long />
            <span aria-hidden className="px-1.5 text-ink-faint">
              ·
            </span>
            {words} {words === 1 ? "word" : "words"}
            {backlinks.length > 0 && (
              <>
                <span aria-hidden className="px-1.5 text-ink-faint">
                  ·
                </span>
                <button
                  type="button"
                  aria-expanded={showBacklinks}
                  onClick={() => setShowBacklinks((v) => !v)}
                  className="underline-offset-2 hover:text-ink hover:underline"
                >
                  {backlinks.length}{" "}
                  {backlinks.length === 1 ? "backlink" : "backlinks"}
                </button>
              </>
            )}
          </p>

          {showBacklinks && (
            <ul className="mt-[var(--space-item)] flex flex-col gap-[var(--space-item)]">
              {backlinks.map((backlink) => (
                <li key={backlink.slug}>
                  <Link
                    // No `from` — a link between notes leaves the index behind.
                    href={noteHref(backlink.slug)}
                    className="row-tint block rounded-[var(--radius-control)] px-2 py-1 text-[13px] text-ink-muted hover:text-ink"
                  >
                    {backlink.title || "Untitled"}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {showTagNudge && (
            // Muted text, not a banner — untagged isn't an error.
            <p className="mt-[var(--space-item)] text-[13px] text-ink-faint">
              No tags yet, add one to file this note.
            </p>
          )}

          {conflict && (
            <div className="mt-[var(--space-block)] rounded-[var(--radius-control)] bg-accent-wash px-4 py-3 text-[13px] text-ink">
              This note changed in another tab (last saved{" "}
              {new Date(conflict.updatedAt).toLocaleTimeString()}).
              <span className="ml-2 inline-flex gap-3">
                <button
                  type="button"
                  onClick={() => void keepMine()}
                  className="underline underline-offset-2 hover:text-accent"
                >
                  Keep mine
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="underline underline-offset-2 hover:text-accent"
                >
                  Reload theirs
                </button>
              </span>
            </div>
          )}

          {imageNotice && (
            <p className="mt-[var(--space-block)] rounded-[var(--radius-control)] bg-accent-wash px-4 py-3 text-[13px] text-ink">
              {imageNotice}
              <button
                type="button"
                onClick={() => setImageNotice(null)}
                className="ml-2 underline underline-offset-2 hover:text-accent"
              >
                Dismiss
              </button>
            </p>
          )}

          {aiError && (
            <p className="mt-[var(--space-block)] rounded-[var(--radius-control)] bg-accent-wash px-4 py-3 text-[13px] text-ink">
              {aiError}
              <button
                type="button"
                onClick={() => setAiError(null)}
                className="ml-2 underline underline-offset-2 hover:text-accent"
              >
                Dismiss
              </button>
            </p>
          )}

          {/* The note's filing — above the body, read with the title. */}
          <TagBar
            tags={tags}
            allTags={allTags}
            onChange={updateTags}
            onSuggest={suggestForNote}
          />

          {/* The body — no box; split's halves are separated by a gap. */}
          <div className="mt-[var(--space-block)] flex gap-8">
            <CodeMirrorEditor
              ref={editorRef}
              value={bodyMd}
              onChange={updateBody}
              // Both AI entry points stand down while an answer is under review.
              onSelectionMenu={(anchor) => {
                if (answer) return;
                if (anchor) openAiMenu(anchor);
                else setAiMenu(null);
              }}
              onAskShortcut={(anchor) => {
                if (!answer) openAiMenu(anchor);
              }}
              // Split only — scroll the rendered side to the clicked line.
              onLineClick={(line) => {
                if (mode === "split") previewRef.current?.scrollToLine(line);
              }}
              placeholder="Write in markdown…"
              // Existing note: caret straight into the body. New note starts in
              // the title (the effect above).
              autoFocus={noteId !== null}
              className={`${mode === "preview" ? "hidden " : ""}min-w-0 flex-1`}
            />
            <PreviewPane
              ref={previewRef}
              bodyMd={bodyMd}
              tags={tags}
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

        {/* Hidden, never tabbed to: ⌘K's "Add images" is what opens it. */}
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            // Cleared so picking the same file twice still fires.
            event.target.value = "";
            if (files.length > 0) addImages(files);
          }}
        />

        <SaveToast status={status} onSave={() => void flush()} />

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
            // Rewrite replaces the selection; the other actions add below it.
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
      </PaneScroller>
    </div>
  );
}
