"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { WikilinkNav } from "@/components/render/WikilinkNav";
import { renderPreview } from "@/lib/markdown/actions";

const RERENDER_DEBOUNCE_MS = 400;

export type PreviewHandle = {
  /** Scrolls to the block that came from the given 1-based source line. */
  scrollToLine: (line: number) => void;
};

type Props = {
  bodyMd: string;
  /** Server-rendered HTML for `initialBodyMd`, so the first paint is instant. */
  initialHtml: string;
  initialBodyMd: string;
  /** False while the preview is hidden — no point re-rendering what no one sees. */
  active: boolean;
  /** Fires with the 1-based source line of the block the user clicked. */
  onLineClick?: (line: number) => void;
  className?: string;
  ref?: Ref<PreviewHandle>;
};

export function PreviewPane({
  bodyMd,
  initialHtml,
  initialBodyMd,
  active,
  onLineClick,
  className,
  ref,
}: Props) {
  const [html, setHtml] = useState(initialHtml);
  const [rendered, setRendered] = useState(initialBodyMd);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Bumped per request so a slow render that resolves after a newer one
  // can't overwrite it.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!active || bodyMd === rendered) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void renderPreview(bodyMd).then(
        (next) => {
          if (seq !== requestSeq.current) return;
          setHtml(next);
          setRendered(bodyMd);
        },
        () => {
          // Leave the last good render up; the next keystroke retries.
        },
      );
    }, RERENDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, bodyMd, rendered]);

  useImperativeHandle(ref, () => ({
    scrollToLine(line) {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const blocks = [...scroller.querySelectorAll<HTMLElement>("[data-line]")];
      // Last block that starts at or before the line — the one the cursor is
      // actually sitting inside, since a block spans until the next one.
      let target: HTMLElement | undefined;
      for (const block of blocks) {
        if (Number(block.dataset.line) <= line) target = block;
        else break;
      }
      if (!target) return;
      scroller.scrollTo({ top: target.offsetTop - 16, behavior: "smooth" });
    },
  }), []);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    // Wikilinks navigate (WikilinkNav) — don't also yank the editor around.
    const el = event.target as HTMLElement;
    if (el.closest("a")) return;
    const block = el.closest<HTMLElement>("[data-line]");
    if (block) onLineClick?.(Number(block.dataset.line));
  }

  return (
    // relative so the blocks' offsetTop is measured against this scroller.
    <div
      ref={scrollerRef}
      onClick={handleClick}
      className={`relative overflow-y-auto ${className ?? ""}`}
    >
      {/* Padding lives in here, not on the scroller: the scroller is a
          flex-1 sibling of the editor, and flex-basis:0 can't shrink a
          border-box element below its own padding — so padding out there
          would hand this pane 64px more width than the editor in split. */}
      <div className="px-8 py-6">
        {html ? (
          <WikilinkNav>
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </WikilinkNav>
        ) : (
          <p className="text-base text-ink-faint">Nothing to preview yet.</p>
        )}
      </div>
    </div>
  );
}
