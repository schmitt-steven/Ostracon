import type { StoredImage } from "./queries";

/**
 * The gallery's sort modes. Newest first, as [listStoredImages] already hands
 * them over — the gallery is a record of what you've been putting into notes
 * lately, so that is what it opens on. Time first and size after it, the same
 * shape the index's list has.
 */
export type ImageSortMode = "newest" | "oldest" | "biggest";

export const IMAGE_SORT_MODES: readonly ImageSortMode[] = [
  "newest",
  "oldest",
  "biggest",
];

export const IMAGE_SORT_LABEL: Record<ImageSortMode, string> = {
  newest: "Newest",
  oldest: "Oldest",
  biggest: "Biggest",
};

const COMPARATORS: Record<
  ImageSortMode,
  (a: StoredImage, b: StoredImage) => number
> = {
  // ISO-8601 in a fixed zone sorts correctly as plain strings.
  newest: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
  oldest: (a, b) => a.uploadedAt.localeCompare(b.uploadedAt),
  // Ties fall back to newest so that a run of same-sized uploads keeps one
  // fixed order rather than depending on what the bucket happened to list.
  biggest: (a, b) => b.size - a.size || b.uploadedAt.localeCompare(a.uploadedAt),
};

/**
 * The `?sort=` value, or the default. Anything else — a typo, a stale link, a
 * repeated param — is the default too rather than an error: a bad sort in a URL
 * is not worth a page that refuses to render.
 */
export function parseImageSort(
  value: string | string[] | undefined,
): ImageSortMode {
  return typeof value === "string" &&
    (IMAGE_SORT_MODES as readonly string[]).includes(value)
    ? (value as ImageSortMode)
    : "newest";
}

export function sortImages(
  images: StoredImage[],
  mode: ImageSortMode,
): StoredImage[] {
  return [...images].sort(COMPARATORS[mode]);
}
