/**
 * What may be uploaded into a note, and how much at once. Isomorphic — the
 * file dialog, the drop handler and the upload route read the same numbers,
 * and the route re-checks all of them (the client copy only explains refusals
 * early).
 */

/**
 * The MIME types the route accepts, exact. SVG is absent on purpose — it can
 * carry script, and an executable format nobody asked to paste doesn't belong
 * here even behind a separate-origin blob host.
 */
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/** The file dialog's filter. */
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(",");

/** Per file, before compression. Anything past this is genuine garbage. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Per drop. Ten is already more images than one note wants. */
const MAX_IMAGE_FILES = 10;

/**
 * Per drop, summed over the originals — a guard against a folder dragged in by
 * mistake, checked before anything is decoded or sent. Real photos are
 * compressed first (see [compressImage]).
 */
const MAX_IMAGE_BATCH_BYTES = 60 * 1024 * 1024;

export function isAllowedImageType(type: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(type.toLowerCase());
}

/**
 * Whether a drag *looks* like it carries images. Loose on purpose — mid-drag
 * the browser only exposes the type, so `image/svg+xml` passes here and is
 * refused on the actual drop.
 */
export function looksLikeImageType(type: string): boolean {
  return type.toLowerCase().startsWith("image/");
}

export type ImageSkipReason = "type" | "size" | "too-many" | "no-note";

export type SkippedImage = { name: string; reason: ImageSkipReason };

export type ImageBatch = {
  accepted: File[];
  skipped: SkippedImage[];
  /** Set when the whole batch is refused (only total size does this). */
  refusal: string | null;
};

function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

/** Files, as the notices below count them. */
function count(n: number): string {
  return `${n} image${n === 1 ? "" : "s"}`;
}

export function validateImageBatch(files: File[]): ImageBatch {
  const accepted: File[] = [];
  const skipped: SkippedImage[] = [];

  for (const file of files) {
    if (!isAllowedImageType(file.type)) {
      skipped.push({ name: file.name, reason: "type" });
    } else if (file.size > MAX_IMAGE_BYTES) {
      skipped.push({ name: file.name, reason: "size" });
    } else if (accepted.length >= MAX_IMAGE_FILES) {
      skipped.push({ name: file.name, reason: "too-many" });
    } else {
      accepted.push(file);
    }
  }

  const total = accepted.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_IMAGE_BATCH_BYTES) {
    return {
      accepted: [],
      skipped,
      refusal: `That's ${mb(total)} of images in one go — add them a few at a time.`,
    };
  }

  return { accepted, skipped, refusal: null };
}

/**
 * What went wrong, as one sentence, or null. Grouped by cause and counted, not
 * listed by filename.
 */
export function describeSkippedImages(skipped: SkippedImage[]): string | null {
  if (skipped.length === 0) return null;

  const counts = new Map<ImageSkipReason, number>();
  for (const file of skipped) {
    counts.set(file.reason, (counts.get(file.reason) ?? 0) + 1);
  }

  const clauses: string[] = [];
  const wrongType = counts.get("type") ?? 0;
  if (wrongType > 0) {
    clauses.push(`${count(wrongType)} skipped — PNG, JPEG, WebP, GIF or AVIF`);
  }
  const tooBig = counts.get("size") ?? 0;
  if (tooBig > 0) {
    clauses.push(`${count(tooBig)} over ${mb(MAX_IMAGE_BYTES)}`);
  }
  const tooMany = counts.get("too-many") ?? 0;
  if (tooMany > 0) {
    clauses.push(`${count(tooMany)} past ${MAX_IMAGE_FILES} per drop`);
  }
  const noNote = counts.get("no-note") ?? 0;
  if (noNote > 0) {
    clauses.push(`${count(noNote)} need a note open to go into`);
  }

  return `${clauses.join(" · ")}.`;
}
