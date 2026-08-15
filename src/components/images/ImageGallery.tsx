import Image from "next/image";
import Link from "next/link";
import { LocalDate } from "@/components/ui/LocalDate";
import type { StoredImage } from "@/lib/images/queries";

// Two columns on a phone, three once there's room. The page is capped at
// max-w-4xl, so past that breakpoint a tile never exceeds ~260px — hence the
// fixed second half of `sizes` instead of a viewport fraction.
const SIZES = "(max-width: 640px) 50vw, 260px";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Thumbnail({ image }: { image: StoredImage }) {
  return (
    <>
      <div className="relative aspect-4/3 overflow-hidden rounded-2xl border border-line bg-paper-sunk transition-all group-hover:border-blue/40 group-hover:shadow-md group-hover:shadow-ink/5">
        <Image
          src={image.url}
          // The filename is the only description that exists — nothing records
          // alt text for pasted uploads.
          alt={image.filename}
          fill
          sizes={SIZES}
          // contain, not cover: these are mostly screenshots and diagrams, and
          // cropping one to a tidy 4:3 tends to cut off the very text that
          // tells you which screenshot it is.
          className="object-contain transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:scale-[1.03]"
        />
      </div>
      <p className="mt-2.5 truncate text-base font-medium text-ink transition-colors group-hover:text-blue">
        {image.note.title || "Untitled"}
      </p>
      <p className="mt-1 truncate text-sm text-ink-faint">
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
    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3">
      {images.map((image) => (
        <li key={image.url}>
          <Link
            href={`/notes/${image.note.slug}`}
            // The filename is otherwise nowhere in the UI — the caption line
            // is spent on the note, which is the more useful label.
            title={image.filename}
            className="group block focus-visible:outline-none"
          >
            <Thumbnail image={image} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
