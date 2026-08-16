"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACTION_LABELS, type AiAction } from "@/lib/ai/types";
import type { AnswerPlacement } from "./CodeMirrorEditor";

// Wide enough for the footer's five controls to sit on one line at their
// natural width — below about 500 "Insert below" is the one that gives, and it
// wraps to two lines while everything beside it stays put.
const CARD_WIDTH = 520;
// Tall enough to read a paragraph or two without scrolling, short enough that
// the card can't cover the passage it's answering about.
const MAX_BODY_HEIGHT = 280;

/**
 * Shown while a request is in flight with nothing back from it yet. Its own
 * component so the clock starts from mount: the count needs to reset on a
 * Retry, and owning it here does that without resetting state from an effect.
 */
function WaitingLine() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="flex items-center gap-2.5 text-sm text-ink-muted">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-action"
      />
      Waiting for the first words…
      <span className="tabular-nums text-ink-faint">{elapsed}s</span>
    </p>
  );
}

type Props = {
  x: number;
  y: number;
  action: AiAction;
  /** The user's own wording, shown instead of the label for an "ask". */
  question?: string;
  /** null while the provider list is still loading, or if none matched. */
  providerLabel: string | null;
  /** The answer so far — grows while `streaming`. */
  text: string;
  streaming: boolean;
  /** False when raised at the bare cursor: there's nothing to replace. */
  canReplace: boolean;
  /** Which placement the primary button offers. */
  defaultPlacement: AnswerPlacement;
  onInsert: (placement: AnswerPlacement) => void;
  onRetry: () => void;
  onStop: () => void;
  onDiscard: () => void;
};

/**
 * The answer to an AI request, held outside the note until the user accepts
 * it. Nothing here writes to the document — that's what makes the AI's
 * contribution legible as the AI's, and what makes Stop and Discard cost
 * nothing instead of leaving half a paragraph behind to clean up.
 */
export function AiAnswerCard({
  x,
  y,
  action,
  question,
  providerLabel,
  text,
  streaming,
  canReplace,
  defaultPlacement,
  onInsert,
  onRetry,
  onStop,
  onDiscard,
}: Props) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  // Escape discards; clicking outside deliberately doesn't. A generated answer
  // is expensive enough that losing one to a stray click in the note — which
  // is exactly where the user looks while reading it — would be worse than
  // making dismissal explicit.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDiscard();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDiscard]);

  // Follow the tail while tokens arrive, but only from the bottom: scrolling
  // up to re-read something already generated shouldn't be yanked back down.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !streaming) return;
    const distanceFromBottom =
      body.scrollHeight - body.scrollTop - body.clientHeight;
    if (distanceFromBottom < 80) body.scrollTop = body.scrollHeight;
  }, [text, streaming]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  // Same viewport clamp as [AiMenu] — fixed positioning would otherwise let a
  // card raised near the bottom edge hang off-screen.
  const left = Math.min(Math.max(x, 12), window.innerWidth - CARD_WIDTH - 12);
  const top = Math.min(y, window.innerHeight - 320);

  const trimmed = text.trim();
  const empty = trimmed.length === 0;

  return (
    <div
      role="dialog"
      aria-label="AI answer"
      style={{ left, top, width: CARD_WIDTH }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lg shadow-shade/10"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
        <span aria-hidden className="shrink-0 text-xl leading-none text-action">
          ✦
        </span>
        {/* min-w-0 so the two lines truncate inside the row rather than
            pushing Stop off the card's edge. */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-ink">
            {question?.trim() || ACTION_LABELS[action]}
          </p>
          {providerLabel && (
            <p className="truncate text-sm text-ink-muted">{providerLabel}</p>
          )}
        </div>
        {streaming && (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-action transition-colors hover:bg-action hover:text-paper"
          >
            Stop
          </button>
        )}
      </div>

      <div
        ref={bodyRef}
        style={{ maxHeight: MAX_BODY_HEIGHT }}
        className="overflow-y-auto px-4 py-3"
      >
        {empty ? (
          streaming ? (
            // A hosted model can sit on a request for the better part of a
            // minute before the first token, and a bare blinking caret over an
            // empty box reads as a hang rather than as waiting.
            <WaitingLine />
          ) : (
            <p className="text-sm text-ink-faint">No answer came back.</p>
          )
        ) : (
          /* The markdown source, not a rendering of it: this is the text that
             will land in the note, so showing it as it will arrive is more
             honest than previewing a formatted version of it. */
          <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-ink">
            {trimmed}
            {streaming && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-xs bg-action align-baseline"
              />
            )}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-line px-3 py-2">
        <button
          type="button"
          disabled={empty}
          onClick={() => onInsert(defaultPlacement)}
          className="rounded-full bg-action px-3.5 py-1.5 text-sm whitespace-nowrap font-medium text-paper transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {defaultPlacement === "replace" ? "Replace selection" : "Insert below"}
        </button>
        {/* The other placement stays available as a secondary, so a rewrite
            can be kept alongside the original when that's what's wanted. */}
        {canReplace && (
          <button
            type="button"
            disabled={empty}
            onClick={() =>
              onInsert(defaultPlacement === "replace" ? "below" : "replace")
            }
            className="rounded-full border border-line-strong px-3 py-1.5 text-sm whitespace-nowrap text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {defaultPlacement === "replace" ? "Insert below" : "Replace"}
          </button>
        )}
        <button
          type="button"
          disabled={empty}
          onClick={() => {
            void navigator.clipboard.writeText(trimmed).then(() =>
              setCopied(true),
            );
          }}
          className="rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          disabled={streaming}
          onClick={onRetry}
          className="rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="ml-auto rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
