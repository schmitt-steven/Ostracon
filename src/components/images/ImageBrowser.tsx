import type { StoredImage } from "@/lib/images/queries";
import { ImageGallery } from "./ImageGallery";

/**
 * Every image in the collection, newest first.
 *
 * The filter bar this used to carry is gone with the rest of the list chrome:
 * an image has no text of its own, so filtering it always meant filtering the
 * note it came from — and finding a note is what ⌘K is for now. What's left
 * here is the thing you actually come to this view for, which is to look.
 */
export function ImageBrowser({ images }: { images: StoredImage[] }) {
  if (images.length === 0) {
    return (
      <p className="pt-[var(--space-block)] text-base text-ink-muted">
        No images yet. Paste or drop one into a note and it shows up here.
      </p>
    );
  }

  return (
    <div className="pt-[var(--space-block)]">
      <ImageGallery images={images} />
    </div>
  );
}
