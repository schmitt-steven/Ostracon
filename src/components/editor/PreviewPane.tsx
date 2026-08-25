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
  /**
   * The note's tags, as the bar currently holds them. Sent with the body so a
   * `#name` just added in the bar renders as a resolved reference instead of
   * waiting for the save to land — see [renderNoteHtml].
   */
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
  // The tag list `html` was rendered against. Seeded from the mount-time tags
  // rather than left empty, because `initialHtml` came off the server rendered
  // against exactly those — starting it blank would burn a render on open.
  const [renderedTags, setRenderedTags] = useState(() => tags.join(","));
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /**
   * The image being looked at full size, or null. Held here rather than in
   * the lightbox because the rendered HTML is inert markup — the click that
   * opens it is caught by delegation below, which is the same arrangement
   * wikilinks use.
   */
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(
    null,
  );
  // Bumped per request so a slow render that resolves after a newer one
  // can't overwrite it.
  const requestSeq = useRef(0);

  // `tags` is in the dependency list but not in `rendered`: adding a tag
  // changes how the body renders (an unresolved `#name` becomes a link), so a
  // tag change has to re-render even though the text is untouched.
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
        // Last block that starts at or before the line — the one the cursor is
        // actually sitting inside, since a block spans until the next one.
        let target: HTMLElement | undefined;
        for (const block of blocks) {
          if (Number(block.dataset.line) <= line) target = block;
          else break;
        }
        // scrollIntoView rather than scrollTo on this element: the pane no
        // longer scrolls itself (its height is content-driven now), so the
        // scrolling ancestor is the whole note view and only the browser knows
        // which one that is.
        target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      },
    }),
    [],
  );

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    // Wikilinks navigate (WikilinkNav) — don't also yank the editor around.
    const el = event.target as HTMLElement;
    if (el.closest("a")) return;
    // An image opens instead of syncing the editor's scroll: it is the one
    // block in a note that is too small to read at the column's width, and
    // the sentence beside it is still there to click for the sync.
    if (el instanceof HTMLImageElement && el.currentSrc) {
      setZoomed({ src: el.currentSrc, alt: el.alt });
      return;
    }
    const block = el.closest<HTMLElement>("[data-line]");
    if (block) onLineClick?.(Number(block.dataset.line));
  }

  return (
    // No overflow and no padding of its own: the height is content-driven and
    // the note view around it owns both the scrolling and the text column.
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
