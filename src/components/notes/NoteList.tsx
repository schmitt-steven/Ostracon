"use client";

import Link from "next/link";
import {
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { deleteNote } from "@/lib/notes/actions";
import {
  addPendingDelete,
  clearPendingDelete,
  getPendingDeletes,
  getServerPendingDeletes,
  subscribePendingDeletes,
} from "@/lib/notes/pending-deletes";
import {
  collectTags,
  useNoteSearch,
  type NoteOverviewLite,
} from "@/hooks/use-note-search";
import { LocalDate } from "@/components/ui/LocalDate";
import { DeleteNoteButton } from "./DeleteNoteButton";
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

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Removes a row through a view transition: the row itself fades out while every
 * row under it slides up into the space it left.
 *
 * The browser does the hard part. Naming each row makes it a transition
 * participant, so it gets snapshotted before and after the removal and the
 * group animation interpolates between the two boxes — which is what produces
 * the upward slide. Without the names the whole page would be one snapshot and
 * simply crossfade between two stills.
 *
 * `commit` has to apply synchronously (hence `flushSync`): `startViewTransition`
 * captures the "after" state the moment its callback returns, and a plain
 * `setState` would still be queued at that point.
 */
function removeRowWithTransition(
  list: HTMLElement | null,
  leavingId: string,
  commit: () => void,
): void {
  // No support, or the user asked for less motion — the state change alone is
  // the whole feature working, just without the animation.
  if (!list || !document.startViewTransition || prefersReducedMotion()) {
    commit();
    return;
  }

  const rows = [...list.querySelectorAll<HTMLElement>("[data-note-id]")];
  for (const row of rows) {
    // Distinct classes so the CSS can fade the departing row without also
    // fading the ones that are merely sliding — see globals.css.
    row.style.setProperty(
      "view-transition-class",
      row.dataset.noteId === leavingId ? "note-leaving" : "note-staying",
    );
    // Names have to be unique per participant, and stable across the two
    // snapshots so the browser can pair them up.
    row.style.setProperty("view-transition-name", `note-${row.dataset.noteId}`);
  }

  const clearNames = () => {
    // Applied only for the duration: `view-transition-name` makes an element a
    // stacking context and a containing block, which would otherwise trap the
    // confirmation popover behind the card below it.
    for (const row of rows) {
      row.style.removeProperty("view-transition-name");
      row.style.removeProperty("view-transition-class");
    }
  };

  const transition = document.startViewTransition(commit);
  transition.finished.then(clearNames, clearNames);
}

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

  const listRef = useRef<HTMLUListElement>(null);
  // Rows are hidden the moment the user confirms rather than when the server
  // answers — the animation should start on the click. Shared with the heading
  // so both drop the note in the same commit; see `pending-deletes`.
  const pendingDeletes = useSyncExternalStore(
    subscribePendingDeletes,
    getPendingDeletes,
    getServerPendingDeletes,
  );
  const [, startTransition] = useTransition();

  const visible = useMemo(
    () => results.filter((note) => !pendingDeletes.includes(note.id)),
    [results, pendingDeletes],
  );

  const handleDelete = useCallback((id: string) => {
    removeRowWithTransition(listRef.current, id, () => {
      flushSync(() => addPendingDelete(id));
    });

    startTransition(async () => {
      try {
        await deleteNote(id);
      } catch {
        // The row was only hidden optimistically, so a failed delete has to put
        // it back rather than leave a note that looks gone until a reload.
        clearPendingDelete(id);
      }
    });
  }, []);

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

      {visible.length === 0 ? (
        <p className="py-10 text-center text-base text-ink-muted">
          No matching notes.
        </p>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-3">
          {visible.map((note) => (
            // `group/note` is the delete control's hover target, kept
            // separate from the card's own unnamed `group` so hovering the
            // control doesn't light up the card as if it were a link.
            <li
              key={note.id}
              // How the exit animation finds the rows to snapshot.
              data-note-id={note.id}
              className="group/note relative"
            >
              <Link
                href={`/notes/${note.slug}`}
                // pr-16 reserves the corner the delete control sits in, so a
                // long title never runs under it.
                className="group block rounded-2xl border border-line bg-surface px-6 py-5 pr-16 transition-all hover:-translate-y-px hover:border-blue/40 hover:bg-surface-hover hover:shadow-md hover:shadow-shade/5"
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
              <div className="absolute right-4 top-4">
                <DeleteNoteButton
                  title={note.title}
                  onConfirm={() => handleDelete(note.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
