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
 * The scrolling box inside a `.pane`, and the one bit of client state a pane
 * needs: whether anything has scrolled under the header.
 *
 * It scrolls inside the pane, not as the pane, so the wash stays put. The
 * header floats over the scroller rather than living in it (`position: sticky`
 * would leave a scrollbar-gutter strip of wash beside it once the bar takes
 * width); the scroller carries `--head-h` of top padding to stand it off, the
 * same token the header row's `min-h` uses.
 *
 * The `scrolled` flag goes on the frame and `.pane-head` reads it from any
 * ancestor, so a server-rendered page (the gallery) gets a live glass header
 * by wrapping its contents.
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
