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
 * One image, as large as the window allows — the way back from the 680px
 * reading column. Closes on Escape, the ×, or a click anywhere. No zoom/pan —
 * uploads cap at 2000px (see [compressImage]).
 */
export function ImageLightbox({ src, alt, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Remember focus so it can be restored on close.
    const returnTo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Claimed, so the note view's Escape doesn't also navigate away.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    // Capture, to run before the editor's document-level handler.
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
        // A corner target too — on a phone the image fills the backdrop.
        className="glass lift-2 absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink-muted hover:text-ink"
      >
        <CloseIcon aria-hidden className="size-4" />
      </button>

      {/* object-contain, never cropped. A plain <img>, not next/image — this
          shows the upload as-is; the optimizer would re-encode what
          [compressImage] already shrank. */}
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
