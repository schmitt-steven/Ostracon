import Link from "next/link";
import { PaneScroller } from "@/components/shell/PaneScroller";
import type { StoredImage } from "@/lib/images/queries";
import { IMAGE_SORT_LABEL, type ImageSortMode } from "@/lib/images/sort";
import { ALL_NOTES_HREF } from "@/lib/tags/routes";
import { ImageGallery } from "./ImageGallery";
import { ImageSortControl } from "./ImageSortControl";

/**
 * Every image in the collection, in whatever order the page was asked for.
 *
 * The filter bar this used to carry is gone with the rest of the list chrome:
 * an image has no text of its own, so filtering it always meant filtering the
 * note it came from — and finding a note is what ⌘K is for now. What's left
 * here is the thing you actually come to this view for, which is to look, plus
 * the one control that changes what you're looking at first.
 *
 * Server-rendered, sort included: only [ImageSortControl] is client code, and
 * it changes the order by changing the URL. Nothing on this page needs the
 * image list in the browser.
 */
export function ImageBrowser({
  images,
  sort,
}: {
  images: StoredImage[];
  sort: ImageSortMode;
}) {
  return (
    // No wash vars: the gallery has no tag of its own, so `.pane` falls back
    // to the registered initial values, which are exactly the neutral palette
    // lib/tags/wash gives an untagged note.
    <div className="pane h-full">
      <PaneScroller
        head={
          <header className="pane-head">
            {/* --head-h: the height [PaneScroller] reserves above its content.
                The sort sets this row's height on its own, as it does in the
                index — the minimum is what keeps the empty gallery's header,
                which has nothing else in it, the same height as the others. */}
            <div className="mx-auto flex min-h-[var(--head-h)] max-w-[680px] items-center gap-4 px-6 py-4">
              {/* -ml-1.5 cancels the first pill's own px-1.5, so "All notes"
                sits over the Images heading below rather than 6px right of
                it. */}
              <nav
                aria-label="Breadcrumb"
                className="-ml-1.5 min-w-0 flex-1 text-[13px]"
              >
                <Link
                  href={ALL_NOTES_HREF}
                  className="tag-pill tag-pill-ink rounded-full px-1.5 py-1 text-ink-muted"
                >
                  All notes
                </Link>
                <span aria-hidden className="text-ink-faint">
                  /
                </span>
                <span className="px-1.5 text-ink">Images</span>
              </nav>
              {/* Nothing to order when there's nothing there, and a control
                  offering to reorder an empty grid is a dead end. */}
              {images.length > 0 && <ImageSortControl value={sort} />}
            </div>
          </header>
        }
      >
        <div className="mx-auto max-w-[680px] px-6 pb-24">
          <div className="pt-2">
            <h1 className="font-display text-[28px] font-medium leading-tight text-ink">
              Images
            </h1>
            <p className="mt-[var(--space-hair)] text-[13px] text-ink-muted">
              {images.length} {images.length === 1 ? "image" : "images"} across
              your notes
            </p>
          </div>

          {images.length === 0 ? (
            <p className="pt-[var(--space-block)] text-base text-ink-muted">
              No images yet. Paste or drop one into a note and it shows up here.
            </p>
          ) : (
            <div className="pt-[var(--space-block)]">
              <ImageGallery images={images} />
            </div>
          )}
        </div>

        {/* Announced, not drawn: the sort has no visible label, so reordering
            the whole grid is otherwise a silent change. */}
        <p className="sr-only" role="status">
          Sorted by {IMAGE_SORT_LABEL[sort]}
        </p>
      </PaneScroller>
    </div>
  );
}
