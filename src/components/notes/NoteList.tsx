"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  collectTags,
  useNoteSearch,
  type NoteOverviewLite,
} from "@/hooks/use-note-search";
import { LocalDate } from "@/components/ui/LocalDate";
import { ListControls } from "./ListControls";
import { SortFilter } from "./SortFilter";

type Props = {
  initialNotes: NoteOverviewLite[];
  /**
   * The notes/images switcher, handed in as a slot. It decides whether this
   * list is on screen at all, so it stays the page's to own — the list just
   * gives it a place to sit in the control row.
   */
  viewSwitcher: ReactNode;
};

export function NoteList({ initialNotes, viewSwitcher }: Props) {
  const {
    query,
    setQuery,
    selectedTags,
    setSelectedTags,
    sort,
    setSort,
    results,
  } = useNoteSearch(initialNotes);

  const allTags = useMemo(() => collectTags(initialNotes), [initialNotes]);

  return (
    <div className="flex flex-col gap-6">
      <ListControls
        query={query}
        onQueryChange={setQuery}
        allTags={allTags}
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        viewSwitcher={viewSwitcher}
        trailing={<SortFilter value={sort} onChange={setSort} />}
      />

      {results.length === 0 ? (
        <p className="py-10 text-center text-base text-ink-muted">
          No matching notes.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {results.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes/${note.slug}`}
                className="group block rounded-2xl border border-line bg-surface px-6 py-5 transition-all hover:-translate-y-px hover:border-blue/40 hover:bg-surface-hover hover:shadow-md hover:shadow-ink/5"
              >
                <span className="font-display text-xl font-semibold tracking-tight text-ink transition-colors group-hover:text-blue">
                  {note.title || "Untitled"}
                </span>
                <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm text-ink-muted">
                  <LocalDate
                    date={note.updatedAt}
                    options={{ dateStyle: "medium", timeStyle: "short" }}
                  />
                  {note.tags.length > 0 && (
                    <span aria-hidden className="text-line-strong">
                      •
                    </span>
                  )}
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-blue-wash px-3 py-1 font-medium text-blue"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
