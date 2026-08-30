"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { ImageLightbox } from "@/components/render/ImageLightbox";
import { WikilinkNav } from "@/components/render/WikilinkNav";
import { renderPreview } from "@/lib/markdown/actions";

const RERENDER_DEBOUNCE_MS = 400;

export type PreviewHandle = {
  /** Scrolls to the block that came from the given 1-based source line. */
  scrollToLine: (line: number) => void;
};

type Props = {
  bodyMd: string;
  /** The note's current tag bar, sent with the body so a just-added `#name`
   * resolves without a save — see [renderNoteHtml]. */
  tags: string[];
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
  tags,
  initialHtml,
  initialBodyMd,
  active,
  onLineClick,
  className,
  ref,
}: Props) {
  const [html, setHtml] = useState(initialHtml);
  const [rendered, setRendered] = useState(initialBodyMd);
  // The tags `html` was rendered against — seeded from mount-time tags, which
  // `initialHtml` was server-rendered against.
  const [renderedTags, setRenderedTags] = useState(() => tags.join(","));
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // The zoomed image, or null — the click is caught by delegation below, like
  // wikilinks.
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(
    null,
  );
  // Bumped per request so a stale render can't overwrite a newer one.
  const requestSeq = useRef(0);

  // A tag change re-renders even with the text untouched (`#name` → link).
  const tagKey = tags.join(",");
  useEffect(() => {
    if (!active || (bodyMd === rendered && tagKey === renderedTags)) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void renderPreview({ bodyMd, tags }).then(
        (next) => {
          if (seq !== requestSeq.current) return;
          setHtml(next);
          setRendered(bodyMd);
          setRenderedTags(tagKey);
        },
        () => {
          // Leave the last good render up; the next keystroke retries.
        },
      );
    }, RERENDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, bodyMd, rendered, tagKey, renderedTags, tags]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line) {
        const root = scrollerRef.current;
        if (!root) return;
        const blocks = [...root.querySelectorAll<HTMLElement>("[data-line]")];
        // The last block starting at or before the line.
        let target: HTMLElement | undefined;
        for (const block of blocks) {
          if (Number(block.dataset.line) <= line) target = block;
          else break;
        }
        // scrollIntoView, not scrollTo — the pane doesn't scroll itself.
        target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      },
    }),
    [],
  );

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    // Wikilinks navigate (WikilinkNav) — don't also sync the editor.
    const el = event.target as HTMLElement;
    if (el.closest("a")) return;
    // An image opens the lightbox instead of syncing.
    if (el instanceof HTMLImageElement && el.currentSrc) {
      setZoomed({ src: el.currentSrc, alt: el.alt });
      return;
    }
    const block = el.closest<HTMLElement>("[data-line]");
    if (block) onLineClick?.(Number(block.dataset.line));
  }

  return (
    // No overflow or padding — the note view owns scrolling and the column.
    <div ref={scrollerRef} onClick={handleClick} className={className}>
      <div>
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

      {zoomed && (
        <ImageLightbox
          src={zoomed.src}
          alt={zoomed.alt}
          onClose={() => setZoomed(null)}
        />
      )}
    </div>
  );
}
