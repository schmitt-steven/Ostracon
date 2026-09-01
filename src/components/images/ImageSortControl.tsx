"use client";

import { useRouter } from "next/navigation";
import { SortControl } from "@/components/ui/SortControl";
import {
  IMAGE_SORT_LABEL,
  IMAGE_SORT_MODES,
  type ImageSortMode,
} from "@/lib/images/sort";

/**
 * The gallery's sort, kept in the URL — the grid stays server-rendered.
 * `replace`, not `push`, and `scroll: false`: re-sorting isn't somewhere you
 * were. The default mode drops the param, so the resting URL is the sidebar's
 * link.
 */
export function ImageSortControl({ value }: { value: ImageSortMode }) {
  const router = useRouter();

  return (
    <SortControl
      value={value}
      modes={IMAGE_SORT_MODES}
      labels={IMAGE_SORT_LABEL}
      label="Sort images"
      onChange={(mode) =>
        router.replace(mode === "newest" ? "/images" : `/images?sort=${mode}`, {
          scroll: false,
        })
      }
    />
  );
}
