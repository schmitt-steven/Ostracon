import Image from "next/image";
import Link from "next/link";
import { LocalDate } from "@/components/ui/LocalDate";
import type { StoredImage } from "@/lib/images/queries";
import { noteHref } from "@/lib/tags/routes";

// Two columns on a phone, three otherwise. The 680px column caps a tile at
// ~215px, hence the fixed 220px rather than a viewport fraction.
const SIZES = "(max-width: 640px) 50vw, 220px";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// The first row (three columns at widest) — the only above-the-fold tiles,
// one of them the LCP. Loaded eagerly; one row only.
const EAGER_TILES = 3;

function Thumbnail({ image, eager }: { image: StoredImage; eager: boolean }) {
  return (
    <>
      {/* Tone and radius, no stroke or shadow — the design has no cards. */}
      <div className="relative aspect-4/3 overflow-hidden rounded-[var(--radius-control)] bg-sunk">
        <Image
          src={image.url}
          // The filename is the only description — no alt text for pasted uploads.
          alt={image.filename}
          fill
          sizes={SIZES}
          // Not `priority` — deprecated in Next 16.
          loading={eager ? "eager" : "lazy"}
          // contain, not cover — cropping a screenshot cuts off the text.
          className="object-contain transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:scale-[1.03]"
        />
      </div>
      <p className="mt-[var(--space-item)] truncate font-display text-base font-medium text-ink">
        {image.note.title || "Untitled"}
      </p>
      <p className="mt-[var(--space-hair)] truncate text-[13px] text-ink-muted">
        <LocalDate date={image.uploadedAt} options={{ dateStyle: "medium" }} />
        <span aria-hidden> · </span>
        {formatSize(image.size)}
      </p>
    </>
  );
}

/** Just the grid — the empty and filtered-to-nothing states are ImageBrowser's. */
export function ImageGallery({ images }: { images: StoredImage[] }) {
  return (
    <ul className="grid grid-cols-2 gap-[var(--space-row)] sm:grid-cols-3">
      {images.map((image, i) => (
        <li key={image.url}>
          <Link
            href={noteHref(image.note.slug)}
            // The filename is otherwise nowhere in the UI.
            title={image.filename}
            className="group block focus-visible:outline-none"
          >
            <Thumbnail image={image} eager={i < EAGER_TILES} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
