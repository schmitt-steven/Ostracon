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
  /**
   * What the note is called while its title is empty — the day title the
   * server will save (see [defaultNoteTitle]). Computed there and handed down
   * so the placeholder can't disagree with the title that actually lands.
   */
  defaultTitle: string;
  initialBodyMd: string;
  /** The note's tags, as filed. Edited in the tag bar, never in the body. */
  initialTags: string[];
  /**
   * The index this note was opened from, straight off the query string —
   * validated here rather than by the caller, see [resolveContextTag].
   * Absent for every way in that has no index behind it.
   */
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

/**
 * How wide the text column is allowed to get.
 *
 * 680px is the reading measure, and prose never exceeds it — surplus window
 * width becomes margin rather than longer lines. Split is the one exception,
 * and only because it isn't one column: two 680px columns would need a 1400px
 * pane, so each half gets a little over half the measure and the pair stays
 * within what the eye can track.
 */
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
 * View B — one note.
 *
 * The pane is lit by the note's own tags — four soft lights in their hues,
 * the first tag's in the top-left corner — so arriving here from a green
 * index reads as staying in the same place rather than as a page swap. See
 * lib/tags/wash for which four, and `.pane` in globals.css for how
 * they're painted. There is no card, no fixed height and no toolbar: the
 * title, the metadata line and the body are three blocks of text on one
 * surface, separated by space.
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
  /**
   * The id the note has *now*.
   *
   * For an existing note that's the prop and stays it; for a new one the id
   * arrives from the first save, and it's held here so the controls that need
   * one can appear the moment it lands. It used to arrive by navigating to the
   * note's own route, which is what made creation destroy everything else on
   * this page — see the autosave's onCreated below.
   */
  const [savedId, setSavedId] = useState(noteId);
  // True once this editor has swapped its own URL (below). While it is, the
  // address bar and the mounted tree belong to different routes, and any
  // server action that refreshes the client router would resolve that by
  // unmounting this editor — so the ones reachable from inside it are told to
  // hold off. See `canRefreshShell` in notes/actions.
  const [urlSwapped, setUrlSwapped] = useState(false);
  // Every note opens on the writing surface, new or not. Opening an existing
  // one in preview treated arriving at a note as a reading act, but in a
  // knowledge base you come back to a note to add to it — and it put a click
  // between the user and the caret every single time. Preview is a mode you
  // ask for, not one you have to leave.
  const [chosenMode, setMode] = useState<ViewMode>("write");
  // What a narrow screen does with split, which it has no room for: shows the
  // writing surface. Derived rather than written back into state, so a window
  // dragged narrow and wide again comes back to the mode it was left in —
  // and so the pane can never be rendering two columns the switch says
  // aren't there. The writing half rather than the rendered one because
  // someone in split is mid-sentence.
  const mode = compact && chosenMode === "split" ? "write" : chosenMode;
  const [showBacklinks, setShowBacklinks] = useState(false);

  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const [aiMenu, setAiMenu] = useState<AiAnchor | null>(null);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const words = useMemo(() => countWords(bodyMd), [bodyMd]);

  /**
   * The tag this note is being read *under*: what the breadcrumb names, where
   * the breadcrumb and Escape lead back to, and the hue of the pills inside.
   *
   * It's the index you came from, not a property of the note. A note filed
   * under both #frontend and #backend opened from the #backend list belongs,
   * for as long as you are looking at it, to #backend — a breadcrumb reading
   * "#frontend" there both misdescribes where you are and, followed, drops you
   * in a list you were never in. Arriving with no index behind you (a
   * bookmark, a backlink, the rail) falls back to the note's first tag, which
   * is the first the user added rather than the alphabetically-first, so the
   * colour follows what the note is about instead of what it's called.
   *
   * Recomputed against `tags` rather than settled on the server, so taking the
   * tag off the note in the bar below drops the breadcrumb to the fallback
   * instead of leaving it pointing at an index this note has just left.
   */
  const contextTag = useMemo(
    () => resolveContextTag(openedFrom, tags),
    [openedFrom, tags],
  );

  /**
   * What the pane is lit by — see lib/tags/wash.
   *
   * The note's tags in the order they were filed, which puts the first one in
   * the top-left light: the corner the eye starts from, reading the title.
   * Four is all the wash has room for, and a note with fewer has the wheel
   * filled in around them.
   *
   * The context tag is deliberately *not* moved to the front. It only ever
   * reordered the lights and never added a colour — a note opened under
   * `#infra` is tagged `#infra` or `#infra/ci`, and hues are read off the root
   * either way — so all that promotion did was make the same four tags light
   * the pane differently depending on which list you arrived from.
   *
   * `--h` rides along for the tag pills and links inside the pane, which are
   * still coloured one tag at a time.
   */
  const paneStyle = useMemo(() => {
    const vars: Record<string, string> = washVars(washLights(tags, hueOf));
    if (contextTag) vars["--h"] = String(hueOf(contextTag));
    return vars as React.CSSProperties;
  }, [contextTag, hueOf, tags]);

  // Read at the moment the button is pressed rather than on every keystroke:
  // the heuristic scans the whole note, and nothing needs its answer until
  // someone asks for one.
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
  // invisible until a reload.
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

  const { status, conflict, scheduleSave, flush, keepMine } = useAutosave({
    initialNoteId: noteId,
    initialVersion: version,
    onCreated: (result) => {
      setSavedId(result.id);
      // Not router.replace. /notes/new and /notes/[slug] are different route
      // segments, so navigating between them unmounts this editor and mounts
      // a fresh one from server props — mid-typing, with the caret in it. Two
      // things went with it: everything the user had done since the save that
      // triggered the create (a tag picked while it was in flight was simply
      // dropped, since the debounce timer was cleared on the way out), and the
      // note's whole client state — focus, caret, scroll, an open tag field.
      //
      // history.replaceState re-runs no routing at all; the App Router reads
      // it and keeps usePathname in step. The URL catches up to the note while
      // the editor stays exactly where it is. Correct for good, not just for
      // now: the slug is fixed at creation and no rename ever moves it (see
      // notes/actions).
      // No `from`: a note being created has no index behind it — it was
      // started from the rail or the palette, not opened out of a list — and
      // its breadcrumb follows the tags it has just been given.
      window.history.replaceState(null, "", noteHref(result.slug));
      setUrlSwapped(true);
    },
  });

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

  // The metadata line's "Edited …". The prop is the server's answer and goes
  // stale the moment a save lands, so each landing stamps a fresh one rather
  // than the line sitting there claiming the note was edited ten minutes ago
  // while it's being typed into.
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

  // Memoised, unlike its two neighbours, only because the ⌘K "Suggest tags"
  // command below closes over it and would otherwise re-register on every
  // keystroke for no reason.
  const updateTags = useCallback(
    (value: string[]) => {
      const next = normalizeTagList(value);
      setTags(next);
      scheduleSave({ title, bodyMd, tags: next });
    },
    [bodyMd, scheduleSave, title],
  );

  /**
   * A note started *from* something — the palette's "New note titled …", a
   * broken [[wikilink]] someone followed — arrives with its title or its tag
   * already decided, and lands here looking like a note that exists.
   *
   * It didn't. Nothing was written until the user changed something, so
   * leaving without touching it threw away a note they had already named,
   * silently and with nothing to undo. The naming *was* the act of creating
   * it, so the seeded draft goes in dirty and the first debounce writes it —
   * or the unmount flush does, if they leave sooner than that.
   *
   * A bare /notes/new stays lazy on purpose: nothing has been said yet, and
   * creating on arrival would file an empty note every time the palette is
   * opened and thought better of.
   */
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

  // display:none leaves CodeMirror with stale measurements; re-measure when
  // the pane comes back rather than tearing the view (and its undo history)
  // down on every mode switch.
  useEffect(() => {
    if (mode !== "preview") editorRef.current?.remeasure();
  }, [mode]);

  // A new note opens in the title, an existing one in the body (see the
  // editor's autoFocus below) — the two never compete for the same mount.
  // The caret goes to the end of whatever the note arrived named rather than
  // over it: a title seeded by the palette's "New note titled …" or by a
  // broken [[wikilink]] is one the user has already chosen, so it's there to
  // be added to, not typed over by the next keystroke.
  useEffect(() => {
    if (noteId !== null) return;
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    // Mount-once: this is about opening a new note, not a standing rule about
    // where focus lives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A textarea holds whatever height it was given, so it has to be re-fitted
  // to the wrapped text on every change — a title is allowed to run to as many
  // lines as it needs, and nothing here clips or truncates it.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  // Escape goes back to the index the note belongs to — the same destination
  // the breadcrumb's tag segment points at. Deterministic rather than
  // history.back(), which lands somewhere different depending on how you got
  // here, and on nothing at all when you arrived from a bookmark.
  const backHref = contextTag ? tagHref(contextTag) : ALL_NOTES_HREF;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      // Escape inside the editor is CodeMirror's (closing the search panel),
      // and inside the title it's a chance to stop typing.
      if (target?.closest(".cm-editor, input, textarea, [role='dialog']")) {
        return;
      }
      router.push(backHref);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [backHref, router]);

  // Nothing is registered into ⌘K from here any more. The mode switches and
  // "Add tags" were duplicates of controls already on screen — the toggle sits
  // in the header and the tag bar is a click away above the body — and a
  // palette that mirrors every visible control is a second interface to keep
  // in step rather than a shortcut. Contextual commands are still supported
  // (lib/command/registry); a view that has a verb with nowhere else to live
  // can register one.

  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Only flush when focus leaves the editor entirely — not when it just
    // hops between the title and the body (every such hop fires a blur too,
    // and flushing there raced note-creation against still-empty fields the
    // user hadn't reached yet).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      void flush();
    }
  }

  // The nudge fires on the note's second edit, not its first: a note that has
  // just been started has every right to be untagged for a minute. `version`
  // is the server's count of saves, so this is "you've come back to it".
  const showTagNudge =
    savedId !== null &&
    tags.length === 0 &&
    version + savesThisSession >= 3 &&
    bodyMd.trim().length > 0;

  return (
    <div className="pane pane-etched h-full" style={paneStyle}>
      {/* The header is glass, and only once there's something behind it — see
          .pane-head. It used to be painted the same flat tint as the pane and
          could therefore hide what scrolled under it outright; over a wash
          there is no one colour to match, and an opaque bar would read as a
          seam across the gradient. */}
      <PaneScroller
        onBlur={handleContainerBlur}
        head={
          <header className="pane-head">
            <div
              className={`mx-auto flex min-h-[var(--head-h)] items-center gap-3 px-6 py-4 ${COLUMN[mode]}`}
            >
              {/* min-w-0 is what lets the title segment shrink and ellipsise
                instead of forcing the row wider than the pane — the overflow
                that used to push controls off the edge. */}
              <nav
                aria-label="Breadcrumb"
                className="flex min-w-0 flex-1 items-center text-[13px]"
              >
                {/* Same pill the tags themselves get, so a tag reads the same
                  wherever it appears — in the bar, or here in the path. */}
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
                    {/* The way back. There is no back button — this is it, and
                      Escape does the same thing. */}
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
              {/* Both only once the note exists: there is nothing to pin or delete
                until the first save has given it an id. On a new note that id
                now arrives in place, so the pair fades in where they used to be
                delivered by a route swap. */}
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
            // A textarea rather than an input so a long title wraps instead of
            // scrolling out of sight sideways. It stays a one-line field in
            // spirit: rows=1 plus the grow effect above, and Enter commits to
            // the body instead of inserting a newline.
            rows={1}
            value={title}
            // Pasted newlines would grow the field into a paragraph — a title is
            // one line of text however it arrives.
            onChange={(e) =>
              updateTitle(e.target.value.replace(/\s*\n+\s*/g, " "))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder={defaultTitle}
            aria-label="Note title"
            // The global :focus-visible rule would box this borderless field in
            // an accent ring — text inputs match :focus-visible on click too, so
            // it shows up the moment you start titling a note. The caret in
            // 28px display type is affordance enough. That rule is unlayered, so
            // it outranks any utility layer regardless of specificity — hence
            // the `!`.
            className="mt-2 w-full resize-none overflow-hidden bg-transparent font-display text-[28px] font-medium leading-[1.3] text-ink outline-none focus-visible:outline-none!"
          />

          {/* One plain line. No pills, no chips, no filled badges — the three
              facts a note has about itself, set as a sentence. */}
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
                    // Deliberately without a `from`: following a link between
                    // two notes leaves whatever index you were in, and the note
                    // you land on is read under its own first tag.
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
            // Quiet on purpose: a line of muted text, not a banner. Untagged is
            // the new /misc/ in a system with nothing but tags, and the moment
            // to say so is while the note is being worked on — but saying it
            // loudly would make it an error, which it isn't. The bar above is
            // already sitting there empty; this only says why that matters.
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

          {/* The note's filing, on its own line between the metadata and the
              text. Above the body rather than below it because it's read at the
              same moment the title is — "what is this and where does it go" —
              and because a bar under the text is a bar you scroll to find. */}
          <TagBar
            tags={tags}
            allTags={allTags}
            onChange={updateTags}
            onSuggest={suggestForNote}
          />

          {/* The body. No box: no border, no background, no shadow, no height of
              its own. In split, the two halves are separated by a gap rather
              than the hairline that used to divide them. */}
          <div className="mt-[var(--space-block)] flex gap-8">
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
              // Clicking a line in the source scrolls the rendered side to the
              // block it produced (split only — nothing to sync otherwise).
              onLineClick={(line) => {
                if (mode === "split") previewRef.current?.scrollToLine(line);
              }}
              // Shown on the empty note, and the only thing on that surface: it
              // says what this is (markdown, not a rich-text box) and nothing
              // else. Tags are filed in the bar above, not written into the
              // prose, so there is no shortcut left to advertise here.
              placeholder="Write in markdown…"
              // Opening an existing note puts the caret in the body straight
              // away, so the editor is visibly live and typing works without a
              // click first. Only for a note that exists — a new one starts in
              // the title instead, which the effect above claims.
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
      </PaneScroller>
    </div>
  );
}
