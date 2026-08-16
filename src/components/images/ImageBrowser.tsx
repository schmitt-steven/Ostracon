"use client";

import { useMemo, type ReactNode } from "react";
import { ListControls } from "@/components/notes/ListControls";
import {
  collectRecency,
  collectTags,
  useNoteSearch,
  type NoteOverviewLite,
} from "@/hooks/use-note-search";
import type { StoredImage } from "@/lib/images/queries";
import { ImageGallery } from "./ImageGallery";

type Props = {
  images: StoredImage[];
  /**
   * The full note overview, not just the notes holding an image: it's what
   * `useNoteSearch` resolves hits against, and passing a subset would give the
   * search index a different fingerprint from the list view's, making the two
   * views evict each other's cached index every time you switch.
   */
  notes: NoteOverviewLite[];
  viewSwitcher: ReactNode;
};

/**
 * The gallery, filtered by the same search box and tag pills as the note list.
 *
 * An upload has no text of its own, so it takes its note's: an image matches a
 * query or a tag exactly when the note it was uploaded in does. That runs
 * through the very same `useNoteSearch` the list view uses — same index, same
 * fuzzy matching, same stored filter state — with the note results used as a
 * lookup set rather than rendered.
 */
export function ImageBrowser({ images, notes, viewSwitcher }: Props) {
  const {
    query,
    setQuery,
    selectedTags,
    setSelectedTags,
    selectedRecency,
    setSelectedRecency,
    results,
  } = useNoteSearch(notes);

  const allTags = useMemo(() => collectTags(notes), [notes]);
  const availableRecency = useMemo(() => collectRecency(notes), [notes]);

  const filtering =
    query.trim().length > 0 ||
    selectedTags.length > 0 ||
    selectedRecency.length > 0;

  const visible = useMemo(() => {
    if (!filtering) return images;
    const matched = new Set(results.map((note) => note.id));
    return images.filter((image) => matched.has(image.note.id));
  }, [filtering, images, results]);

  return (
    <div className="flex flex-col gap-6">
      <ListControls
        query={query}
        onQueryChange={setQuery}
        allTags={allTags}
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        selectedRecency={selectedRecency}
        onRecencyChange={setSelectedRecency}
        availableRecency={availableRecency}
        viewSwitcher={viewSwitcher}
      />
      {images.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-8 py-16 text-center">
          <p className="font-display text-xl text-ink">No images yet</p>
          <p className="mt-2 text-base text-ink-muted">
            Paste or drop an image into a note and it shows up here.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-base text-ink-muted">
          No images in matching notes.
        </p>
      ) : (
        <ImageGallery images={visible} />
      )}
    </div>
  );
}
