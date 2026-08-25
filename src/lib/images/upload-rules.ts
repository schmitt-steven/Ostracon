/**
 * What may be uploaded into a note, and how much of it at once.
 *
 * Isomorphic on purpose: the file dialog's filter, the drop handler and the
 * upload route all read the same numbers, and the route re-checks every one of
 * them. The client's copy is there to explain a refusal *before* someone
 * spends a minute uploading — it is not the control. `/api/uploads` is a POST
 * endpoint anyone signed in can reach directly.
 */

/**
 * The types the route accepts, by exact MIME rather than an `image/` prefix.
 *
 * SVG is deliberately absent. It is a document, not a bitmap: it can carry
 * script, and a stored SVG served back to the reader is stored XSS wherever
 * the browser treats it as same-origin. Uploads land on the blob store's own
 * host (`*.public.blob.vercel-storage.com`), which is already a separate
 * origin from the app — but "the origin happens to save us" is not a reason to
 * accept an executable format nobody asked to paste.
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
export const MAX_IMAGE_FILES = 10;

/**
 * Per drop, summed over the originals.
 *
 * The guard is against the accident — a folder dragged in by mistake — not
 * against the work: what actually goes over the wire is compressed first (see
 * [compressImage]), so ten phone photos pass here and upload as a few hundred
 * kilobytes. Only a batch that is enormous *before* anything has been decoded
 * gets turned away, and it gets turned away without a byte being sent.
 */
export const MAX_IMAGE_BATCH_BYTES = 60 * 1024 * 1024;

export function isAllowedImageType(type: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(type.toLowerCase());
}

/**
 * Whether a drag *looks* like it carries images.
 *
 * Mid-drag the browser will name each item's type but not let anything read
 * it, so this is the widest the question can be asked — an `image/svg+xml`
 * answers yes here and is then refused on the drop, which is the right way
 * round: the overlay's job is to say where a drop would go, and the refusal
 * belongs to the drop that actually happened.
 */
export function looksLikeImageType(type: string): boolean {
  return type.toLowerCase().startsWith("image/");
}

export type ImageSkipReason = "type" | "size" | "too-many" | "no-note";

export type SkippedImage = { name: string; reason: ImageSkipReason };

export type ImageBatch = {
  accepted: File[];
  skipped: SkippedImage[];
  /**
   * Set when the batch is refused whole rather than filtered. Only the total
   * size does this: dropping 300MB is one mistake, and skipping "some" of it
   * would leave the user guessing which half landed.
   */
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
 * What went wrong, as one sentence, or null when nothing did. Grouped by
 * cause and counted rather than listed: a folder dropped by accident is
 * thirty refusals with one reason, and thirty filenames is a wall.
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
