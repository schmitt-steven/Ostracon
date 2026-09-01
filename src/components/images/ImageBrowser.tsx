import Link from "next/link";
import { ContentBody } from "@/components/shell/ContentBody";
import type { StoredImage } from "@/lib/images/queries";
import { IMAGE_SORT_LABEL, type ImageSortMode } from "@/lib/images/sort";
import { ALL_NOTES_HREF } from "@/lib/tags/routes";
import { ImageGallery } from "./ImageGallery";
import { ImageSortControl } from "./ImageSortControl";

/**
 * Every image in the collection, in the requested order. No filter — an image
 * has no text of its own, so filtering meant filtering its note, which is
 * ⌘K's job. Server-rendered; only [ImageSortControl] is client code, changing
 * the order via the URL.
 */
export function ImageBrowser({
  images,
  sort,
}: {
  images: StoredImage[];
  sort: ImageSortMode;
}) {
  return (
    // No wash vars — the gallery has no tag, so `.content` is neutral.
    <div className="content h-full">
      <ContentBody
        head={
          <header className="content-head">
            {/* min-h-[--head-h] so the empty gallery's header matches the others. */}
            <div className="mx-auto flex min-h-[var(--head-h)] max-w-[680px] items-center gap-4 px-6 py-4">
              {/* -ml-1.5 cancels the pill's padding so "All notes" lines up. */}
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
              {/* Nothing to order when the grid is empty. */}
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

        {/* Announced — the sort has no visible label. */}
        <p className="sr-only" role="status">
          Sorted by {IMAGE_SORT_LABEL[sort]}
        </p>
      </ContentBody>
    </div>
  );
}
