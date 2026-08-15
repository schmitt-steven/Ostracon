"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useNoteSearch, type NoteOverviewLite } from "@/hooks/use-note-search";
import { LocalDate } from "@/components/ui/LocalDate";
import { TagFilter } from "./TagFilter";

export function NoteList({ initialNotes }: { initialNotes: NoteOverviewLite[] }) {
  const { query, setQuery, selectedTags, setSelectedTags, results } =
    useNoteSearch(initialNotes);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const note of initialNotes) {
      for (const tag of note.tags) set.add(tag);
    }
    return [...set].sort();
  }, [initialNotes]);

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          className="w-full rounded-full border border-line bg-surface py-3 pl-13 pr-5 text-base text-ink shadow-sm shadow-ink/5 outline-none transition-colors focus:border-blue"
        />
      </div>
      <TagFilter
        allTags={allTags}
        selected={selectedTags}
        onChange={setSelectedTags}
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
