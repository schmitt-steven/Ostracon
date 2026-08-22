"use client";

import { useState, type FocusEvent, type ReactNode } from "react";

type Props = {
  /**
   * The pane's header. Rendered *over* the scrolling box rather than inside
   * it — see below for why — so it is handed in rather than written as the
   * first child.
   */
  head: ReactNode;
  children: ReactNode;
  /** Extra classes for the scrolling box. It is always `h-full overflow-y-auto`. */
  className?: string;
  /** The editor uses this to flush a pending save when focus leaves the pane. */
  onBlur?: (event: FocusEvent<HTMLDivElement>) => void;
};

/**
 * The scrolling box inside a `.pane`, and the one thing every pane needs a
 * client component for: whether anything has scrolled under the header yet.
 *
 * It scrolls *inside* the pane rather than being it, because the wash is
 * painted on the pane's own box and an element that scrolls would drag its
 * background up out of view with the text.
 *
 * **The header is not in the scrolling box.** It used to be, held in place with
 * `position: sticky`, and that is the obvious way to build this — until the
 * scrollbar stops being an overlay. A scroll container's children are clipped
 * to its *scrollport*, which is the padding box minus the scrollbar gutter, so
 * the moment the bar takes width the header stops a bar's width short of the
 * pane's right edge and the wash shows through beside it. Nothing paints into
 * that gutter — not a negative margin, not a wider border — because the clip
 * happens after layout. The only fix is to be outside the box that has the
 * gutter, so the header floats over the scroller and the scroller carries
 * `--head-h` of top padding to stand it off.
 *
 * That height is a token rather than a measurement: every header's row carries
 * `min-h-[var(--head-h)]`, so the height this reserves and the height the
 * header takes are the same declared number — one CSS variable in two places
 * instead of a ResizeObserver and a layout jump on hydration.
 *
 * The flag goes on the frame rather than on the header, and `.pane-head` reads
 * it from any ancestor — so a page that is otherwise entirely server-rendered
 * (the gallery) gets a live glass header by wrapping its contents, without
 * turning into a client component to hold one boolean.
 */
export function PaneScroller({ head, children, className, onBlur }: Props) {
  const [scrolled, setScrolled] = useState(false);

  return (
    // The blur listener sits here rather than on the scroller so it still
    // means "focus left the pane" now that the header's controls are outside
    // the scrolling box.
    <div onBlur={onBlur} data-scrolled={scrolled} className="relative h-full">
      {/* First in the DOM, above in the paint — reading order and tab order
          are the header's, and `z-index` rather than source order is what puts
          it over the scroller. A header that floats over the page is still the
          first thing on it. */}
      <div className="head-layer">{head}</div>
      <div
        // A couple of pixels of slack: elastic overscroll and a trackpad's last
        // frame both land a hair off zero, and at a 0 threshold the header would
        // flicker in and out at the top of the pane.
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 2)}
        className={`pane-scroller h-full overflow-y-auto${className ? ` ${className}` : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
