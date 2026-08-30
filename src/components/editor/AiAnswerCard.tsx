"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACTION_LABELS, type AiAction } from "@/lib/ai/types";
import type { AnswerPlacement } from "./CodeMirrorEditor";

// Wide enough for the footer's five controls on one line.
const CARD_WIDTH = 520;
// Tall enough for a paragraph or two, short enough not to cover the passage.
const MAX_BODY_HEIGHT = 280;

// The "waiting" line, its own component so the clock resets on Retry.
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
 * The answer to an AI request, held outside the note until accepted — so the
 * AI's contribution stays legible as the AI's, and Stop/Discard cost nothing.
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

  // Escape discards; an outside click doesn't — an answer is too expensive to
  // lose to a stray click in the note.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDiscard();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDiscard]);

  // Follow the tail while streaming, but not if the user has scrolled up.
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

  // Viewport clamp, as [AiMenu].
  const left = Math.min(Math.max(x, 12), window.innerWidth - CARD_WIDTH - 12);
  const top = Math.min(y, window.innerHeight - 320);

  const trimmed = text.trim();
  const empty = trimmed.length === 0;

  return (
    <div
      role="dialog"
      aria-label="AI answer"
      style={{ left, top, width: CARD_WIDTH }}
      className="glass lift-2 fixed z-50 flex flex-col overflow-hidden rounded-[var(--radius-zone)]"
    >
      <div className="zone-step flex items-center gap-2.5 px-4 py-2.5">
        <span aria-hidden className="shrink-0 text-xl leading-none text-action">
          ✦
        </span>
        {/* min-w-0 so the lines truncate rather than push Stop off the edge. */}
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
            // A hosted model can sit on a request for most of a minute — a
            // bare caret would read as a hang.
            <WaitingLine />
          ) : (
            <p className="text-sm text-ink-faint">No answer came back.</p>
          )
        ) : (
          /* The markdown source, not a rendering — it's what lands in the note. */
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

      <div className="zone-step flex items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          disabled={empty}
          onClick={() => onInsert(defaultPlacement)}
          className="rounded-full bg-action px-3.5 py-1.5 text-sm whitespace-nowrap font-medium text-paper transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {defaultPlacement === "replace"
            ? "Replace selection"
            : "Insert below"}
        </button>
        {/* The other placement as a secondary. */}
        {canReplace && (
          <button
            type="button"
            disabled={empty}
            onClick={() =>
              onInsert(defaultPlacement === "replace" ? "below" : "replace")
            }
            className="rounded-full bg-sunk px-3 py-1.5 text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {defaultPlacement === "replace" ? "Insert below" : "Replace"}
          </button>
        )}
        <button
          type="button"
          disabled={empty}
          onClick={() => {
            void navigator.clipboard
              .writeText(trimmed)
              .then(() => setCopied(true));
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
