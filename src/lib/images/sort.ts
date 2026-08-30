import type { StoredImage } from "./queries";

/** The gallery's sort modes; defaults to newest, like the note index. */
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
  // Ties fall back to newest for a stable order.
  biggest: (a, b) => b.size - a.size || b.uploadedAt.localeCompare(a.uploadedAt),
};

/** The `?sort=` value, or the default for anything unrecognised. */
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
