"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { RelativeDate } from "@/components/ui/RelativeDate";
import { useTagHues } from "@/hooks/use-tag-hues";
import { setPaletteOpen } from "@/lib/command/palette-state";
import { deleteNote } from "@/lib/notes/actions";
import type { NoteOverviewLite } from "@/lib/notes/queries";
import { ALL_NOTES_HREF } from "@/lib/tags/routes";
import { Asterism } from "./Asterism";
import { DeleteRowButton } from "./DeleteRowButton";
import { SORT_LABEL, SortControl, type SortMode } from "./SortControl";

type Props = {
  notes: NoteOverviewLite[];
  /** The tag being viewed; null for "all notes" and for "untagged". */
  tag: string | null;
  /** Heading for the views that aren't a tag. */
  heading?: string;
};

const COMPARATORS: Record<
  SortMode,
  (a: NoteOverviewLite, b: NoteOverviewLite) => number
> = {
  // ISO-8601 in a fixed zone sorts correctly as plain strings.
  edited: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  // Measured server-side with markup discounted — see notes/text-length. Ties
  // fall back to the title so that a shelf of same-length notes keeps a stable
  // order instead of reshuffling on every render.
  longest: (a, b) =>
    b.textLength - a.textLength || a.title.localeCompare(b.title),
};

/**
 * View A — one tag's notes.
 *
 * Searching happens in ⌘K, not here. This view used to carry its own field,
 * scoped to the notes it was already showing, which made three search boxes
 * on one screen — the rail's tag filter, this, and the palette — each
 * answering a slightly different question that nothing on screen explained.
 * The palette absorbed this one: it opens already narrowed to whatever tag
 * this view is showing, so the scoped search is still one keystroke away.
 * The old field is still in ./IndexSearch, unmounted.
 *
 * Everything separating one row from the next here is space: --space-row
 * between rows, --space-hair between a title and its own snippet. That ratio
 * (26 to 4) is what makes the pairs read as pairs. It's also why every row is
 * exactly the same height and the snippet is clipped to one line — in a list
 * with no rules, rows of differing heights read as disorder rather than as
 * content of differing length.
 */
export function IndexView({ notes, tag, heading }: Props) {
  const router = useRouter();
  const { hueOf } = useTagHues();
  const [sort, setSort] = useState<SortMode>("edited");
  // -1 is "nothing selected", which is where the list starts: a highlighted
  // first row on arrival would look like something had already been clicked.
  const [cursor, setCursor] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  // Rows are hidden the moment deletion is confirmed rather than when the
  // server answers, so the row disappears on the click, not on the round
  // trip. A failed delete puts the id back rather than leaving a note that
  // looks gone until a reload.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();

  const handleDelete = useCallback((id: string) => {
    setDeletedIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      try {
        await deleteNote(id);
      } catch {
        setDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  }, []);

  const liveNotes = useMemo(
    () =>
      deletedIds.size === 0
        ? notes
        : notes.filter((note) => !deletedIds.has(note.id)),
    [notes, deletedIds],
  );

  const sorted = useMemo(
    () => [...liveNotes].sort(COMPARATORS[sort]),
    [liveNotes, sort],
  );

  // j/k/Enter. Ignored while typing anywhere, so `j` in a note title never
  // moves the list underneath it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select, .cm-editor")
      ) {
        return;
      }

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((i) => Math.min(i + 1, sorted.length - 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        const note = sorted[cursor];
        if (!note) return;
        event.preventDefault();
        router.push(`/notes/${note.slug}`);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sorted, cursor, router]);

  // Walking past the fold scrolls the pane rather than leaving the selection
  // somewhere off screen.
  useEffect(() => {
    if (cursor < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const hue = tag ? hueOf(tag) : undefined;
  const title = tag ? `#${tag}` : (heading ?? "All notes");

  return (
    <div
      style={
        hue === undefined ? undefined : ({ "--h": hue } as React.CSSProperties)
      }
      className={`hue-shift h-full overflow-y-auto ${
        hue === undefined ? "bg-surface" : "hue-wash"
      }`}
    >
      <header
        className={`sticky-head ${hue === undefined ? "bg-surface/85" : "hue-wash"}`}
      >
        <div className="mx-auto flex max-w-[680px] items-center gap-4 px-6 py-4">
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-[13px]">
            <Link
              href={ALL_NOTES_HREF}
              className="tag-pill tag-pill-ink rounded-full px-1.5 py-1 text-ink-muted"
            >
              All notes
            </Link>
            {(tag ?? heading) && (
              <>
                <span aria-hidden className="text-ink-faint">
                  /
                </span>
                <span className="px-1.5 text-ink">{title}</span>
              </>
            )}
          </nav>
          <SortControl
            value={sort}
            onChange={(next) => {
              setSort(next);
              // Row 3 of "recently edited" and row 3 of "longest" are different
              // notes, so keeping the index would silently move the selection
              // to something nobody picked.
              setCursor(-1);
            }}
          />
        </div>
      </header>

      <div className="mx-auto max-w-[680px] px-6 pb-24">
        {/* Title block. --space-block below it, --space-hair inside it: the
            title and its own line of metadata are one thing, and the list is
            another. */}
        <div className="pt-2">
          {/* On a tag view the title is also the control: clicking it opens
              ⌘K already scoped to this tag. That link is what lets the scoped
              search field go — the heading was always the thing on screen
              saying "you are inside #infra", and now it is also the way to
              search inside it. Off a tag there is no scope to hand over, so
              the heading stays a heading rather than claiming one. */}
          <h1 className="flex items-center gap-3 font-display text-[28px] font-medium leading-tight text-ink">
            {tag ? (
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label={`Search ${title}`}
                aria-keyshortcuts="Meta+K Control+K"
                className="tag-pill group -mx-2.5 flex min-w-0 items-center gap-3 rounded-full px-2.5 py-0.5 text-left"
              >
                <span
                  aria-hidden
                  className="hue-dot size-[9px] shrink-0 rounded-full"
                />
                <span className="min-w-0 truncate">{title}</span>
                {/* Held in layout at all times, revealed on reach: appearing
                    from nothing would resize the pill under the pointer. */}
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  className="size-4 shrink-0 text-ink-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>
            ) : (
              title
            )}
          </h1>
        </div>

        {notes.length === 0 ? (
          <p className="pt-[var(--space-block)] text-base text-ink-muted">
            Nothing here yet. Tags come from the notes themselves — type{" "}
            <span className="font-mono text-[13px]">#{tag ?? "something"}</span>{" "}
            in a note and it will show up.
          </p>
        ) : (
          <>
            {sorted.length === 0 ? (
              // Every remaining note here was just deleted; `notes` itself
              // (the server's copy) hasn't caught up yet.
              <p className="pt-[var(--space-block)] text-base text-ink-muted">
                Nothing left here.
              </p>
            ) : (
              <>
                {/* --space-block below the title block, as everywhere: the
                    heading and the list are two things, not one. */}
                <ul ref={listRef} className="pt-[var(--space-block)]">
                  {sorted.map((note, index) => {
                    // A row carries the hue of its own first tag on the all-notes
                    // view, where the pane has none to inherit. A note with no
                    // tags has no hue to be lit in either, so it falls back to the
                    // neutral ink tint — inventing one would be the interface
                    // claiming a note is filed when it isn't.
                    const rowTag = note.tags[0] ?? tag;
                    return (
                      <li
                        key={note.id}
                        data-row={index}
                        // Every row is its own stacking context (position:
                        // relative), so with no z-index a later row simply
                        // paints over an earlier row's open popover — z-20 on
                        // the popover itself only wins fights inside this
                        // row. has() lifts the whole row above its siblings
                        // for exactly as long as its dialog is open.
                        className="group/row relative mb-[var(--space-row)] last:mb-0 has-[[role=dialog]]:z-10"
                      >
                        <Link
                          href={`/notes/${note.slug}`}
                          data-active={index === cursor ? "true" : undefined}
                          onFocus={() => setCursor(index)}
                          style={
                            rowTag
                              ? ({
                                  "--h": hueOf(rowTag),
                                } as React.CSSProperties)
                              : undefined
                          }
                          className={`bleed-row flex items-start gap-4 py-1.5 group-has-[[data-row-delete-trigger]:hover]/row:!bg-danger-wash ${
                            rowTag ? "hue-row" : "row-tint"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-base font-medium text-ink group-has-[[data-row-delete-trigger]:hover]/row:text-danger group-has-[[data-row-delete-trigger]:hover]/row:line-through">
                              {note.title || "Untitled"}
                            </span>
                            {/* Always rendered, even when empty: every row has to be
                          the same height, and a missing second line would make
                          this one shorter than its neighbours. */}
                            <span className="mt-[var(--space-hair)] flex min-w-0 items-baseline gap-1.5 text-[13px] text-ink-muted">
                              {/* Not flex-1: the snippet takes only the width it
                            needs and gives up the rest, so the tags sit right
                            after the sentence rather than being pushed to the
                            far edge of the column. It still truncates first,
                            because the tags are the part worth keeping. */}
                              <span className="min-w-0 truncate">
                                {note.snippet}
                              </span>
                              {note.tags
                                // Not the tag whose index this is: printing #images
                                // on every row of the #images list says nothing, and
                                // it crowds out the tags that would.
                                .filter((name) => name !== tag)
                                .slice(0, 3)
                                .map((name) => (
                                  <span
                                    key={name}
                                    style={
                                      {
                                        "--h": hueOf(name),
                                      } as React.CSSProperties
                                    }
                                    className="hue-text shrink-0"
                                  >
                                    #{name}
                                  </span>
                                ))}
                            </span>
                          </span>
                          <RelativeDate
                            date={note.updatedAt}
                            // Yields the corner to the delete control on
                            // hover rather than sitting under it — the two
                            // would otherwise overlap right where the pointer is.
                            className="shrink-0 whitespace-nowrap pt-0.5 text-[13px] text-ink-muted transition-opacity group-hover/row:opacity-0"
                          />
                        </Link>
                        {/* A sibling of the Link, not nested in it — an
                            anchor can't contain a button. Sits in the same
                            corner the date just vacated. */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2">
                          <DeleteRowButton
                            title={note.title}
                            onConfirm={() => handleDelete(note.id)}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Asterism />
              </>
            )}
          </>
        )}
      </div>

      {/* Announced, not drawn: the sort is a select with no visible label,
          so reordering the whole list is otherwise a silent change. */}
      <p className="sr-only" role="status">
        Sorted by {SORT_LABEL[sort]}
      </p>
    </div>
  );
}
