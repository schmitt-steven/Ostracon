"use client";

import { CloseIcon } from "@/icons";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  /** The image's alt text, shown under it when there is one. */
  alt: string;
  onClose: () => void;
};

/**
 * One image, as large as the window allows.
 *
 * A note's column is 680px wide and every picture in it is scaled to fit,
 * which is right for reading and useless for looking — a screenshot of an
 * interface is unreadable at that size. This is the way back to the whole
 * thing: images in a rendered note lift under the pointer and open here.
 *
 * Closing is deliberately over-served — Escape, the ×, and a click anywhere,
 * the image included. There is nothing to *do* in here, so every instinct
 * someone has for leaving should work; a modal whose only exit is a 24px
 * target in a corner is the one that gets sworn at.
 *
 * No zoom, no pan, no next/previous. The uploads are capped at 2000px on the
 * long edge (see [compressImage]), so "as large as the window allows" is
 * already the whole image on any screen this app is used on.
 */
export function ImageLightbox({ src, alt, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Where focus was, so it can be put back. Opening a dialog and then
    // dropping focus at the top of the document is how a keyboard user loses
    // their place in a note.
    const returnTo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Claimed, so the note view's own Escape — which navigates back to the
      // index — doesn't fire behind this one and take the whole page with it.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    // Capture, for the same reason: this handler has to run before the
    // document-level one the editor installed.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      returnTo?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image"}
      onClick={onClose}
      className="scrim fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 p-6 sm:p-10"
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Close image"
        // Its own target in the corner rather than only the backdrop: on a
        // phone there is no backdrop worth aiming at, since the image fills
        // nearly all of it.
        className="glass lift-2 absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink-muted hover:text-ink"
      >
        <CloseIcon aria-hidden className="size-4" />
      </button>

      {/* object-contain against both limits: a tall screenshot is bounded by
          the height and a wide one by the width, and neither is ever cropped
          — the point of opening this is to see all of it.

          A plain <img>, unlike the gallery's tiles: this view exists to show
          the upload as it is, and the optimizer would re-encode what
          [compressImage] already shrank and serve it back at whatever width it
          was asked for. It also has no intrinsic size to hand `next/image`,
          and the note rendering behind this one displays the same URL as a
          plain <img> anyway. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="lift-3 max-h-[86vh] max-w-full rounded-[var(--radius-control)] object-contain"
      />
      {alt && (
        <p className="max-w-[60ch] text-center text-[13px] text-ink-muted">
          {alt}
        </p>
      )}
    </div>
  );
}
