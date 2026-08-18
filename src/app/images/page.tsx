import Link from "next/link";
import { ImageBrowser } from "@/components/images/ImageBrowser";
import { requireAuth } from "@/lib/auth/require-auth";
import { listStoredImages } from "@/lib/images/queries";
import { ALL_NOTES_HREF } from "@/lib/tags/routes";

/**
 * Every image in the collection. Its own route rather than a query string on
 * the index: the rail links to it, and a view the rail can select ought to be
 * a place rather than a mode.
 */
export default async function ImagesPage() {
  await requireAuth();
  const images = await listStoredImages();

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <header className="sticky-head bg-surface/85">
        <div className="mx-auto flex max-w-[680px] items-center gap-4 px-6 py-4">
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-[13px]">
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
        </div>
      </header>

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
        <ImageBrowser images={images} />
      </div>
    </div>
  );
}
