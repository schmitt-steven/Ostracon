"use client";

import { useRouter } from "next/navigation";
import { SortControl } from "@/components/ui/SortControl";
import {
  IMAGE_SORT_LABEL,
  IMAGE_SORT_MODES,
  type ImageSortMode,
} from "@/lib/images/sort";

/**
 * The gallery's sort, kept in the URL rather than in state.
 *
 * The index sorts in the browser because it is a client view already — it has a
 * cursor, a delete, a rename. The gallery has none of that, and holding its
 * order in state would mean shipping every image's metadata to the browser as
 * props on top of the markup already rendered from it, to reorder a list the
 * server can just as well hand over in order. So the grid stays server-rendered
 * and this one button is the only thing here made of JavaScript.
 *
 * `replace`, not `push`: re-sorting a grid is not somewhere you were, and back
 * out of three sorts to leave the page is not what the button looks like it
 * does. `scroll: false` for the same reason — the tiles reorder under you, but
 * you stay where you were looking.
 *
 * The default mode drops the parameter instead of spelling it out, so the
 * gallery's resting URL is the one the rail links to.
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
