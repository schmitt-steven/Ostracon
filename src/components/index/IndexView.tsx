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
import { deleteNote } from "@/lib/notes/actions";
import { requestNoteImport } from "@/lib/notes/import-request";
import type { NoteOverviewLite } from "@/lib/notes/queries";
import { ALL_NOTES_HREF, noteHref } from "@/lib/tags/routes";
import { washLights, washVars } from "@/lib/tags/wash";
import { PaneScroller } from "@/components/shell/PaneScroller";
import { TagDeleteDialog } from "@/components/shell/TagDeleteDialog";
import { TagRenameDialog } from "@/components/shell/TagRenameDialog";
import { Asterism } from "./Asterism";
import { DeleteRowButton } from "./DeleteRowButton";
import { TagHueButton } from "./TagHueButton";
import { TagPinButton } from "./TagPinButton";
import { HeaderSearchButton } from "@/components/ui/HeaderSearchButton";
import { SortControl } from "@/components/ui/SortControl";
import { SORT_LABEL, SORT_MODES, type SortMode } from "./note-sort";

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
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  // moves the list underneath it — and ignored inside a menu or on the control
  // that opens one, where the same arrows are already walking that list. (The
  // sort was a native `<select>`, which the browser fenced off for us; now that
  // it is a menu of our own, the fence has to be spelled out.)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest(
          'input, textarea, select, .cm-editor, [role="menu"], [aria-haspopup="menu"]',
        )
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
        router.push(noteHref(note.slug, tag));
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sorted, cursor, router, tag]);

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

  // The same wash the editor pane gets, from the same file — lit by this
  // view's one tag, or by the neutral palette on All notes and Untagged. The
  // index used to be a flat --surface fill (or, on a tag, one flat tint of its
  // hue) while the note you opened from it had four lights and an etch, so
  // clicking a row changed the material the app was made of. It doesn't now.
  const paneStyle = useMemo(() => {
    const vars: Record<string, string> = washVars(
      washLights(tag ? [tag] : [], hueOf),
    );
    if (hue !== undefined) vars["--h"] = String(hue);
    return vars as React.CSSProperties;
  }, [tag, hue, hueOf]);

  return (
    // pane-etched, the same as the note. The index and the note are the two
    // surfaces you actually read, and until now only one of them had the grain
    // — so opening a row changed the material under the text even though the
    // wash carried over. See `.pane-etched`.
    <div className="pane pane-etched h-full" style={paneStyle}>
      <PaneScroller
        head={
          <header className="pane-head">
            {/* --head-h, because [PaneScroller] stands its content off by
                exactly that much — the header floats over the scroller now, so
                the two numbers are one number. */}
            <div className="mx-auto flex min-h-[var(--head-h)] max-w-[680px] items-center gap-4 px-6 py-4">
              <nav
                aria-label="Breadcrumb"
                className="min-w-0 flex-1 text-[13px]"
              >
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
                modes={SORT_MODES}
                labels={SORT_LABEL}
                label="Sort notes"
                onChange={(next) => {
                  setSort(next);
                  // Row 3 of "recently edited" and row 3 of "longest" are
                  // different notes, so keeping the index would silently move
                  // the selection to something nobody picked.
                  setCursor(-1);
                }}
              />
            </div>
          </header>
        }
      >
        <div className="mx-auto max-w-[680px] px-6 pb-24">
          {/* The heading row on a tag view is four controls and no chrome: the
            colour, the name, search, pin. Three of them are the whole of what
            you can do *to* a tag, and every one of them used to be somewhere
            else — colour in a right-click menu, rename in the same menu,
            pinning too, and search in the heading itself. A tag's own page is
            where you are when those thoughts occur, so they are all here.

            Each is its own target rather than one pill around several. The
            heading carried a shared pill when its two halves were "colour" and
            "search"; with four verbs on the row, one object that tints as a
            whole says nothing about which of them the pointer is on. */}
          <div className="flex items-center gap-2 pt-2">
            {/* gap-1 rather than the gap-3 the old pill had inside it: the
              pill's own px-2.5 now sits between the swatch and the first
              glyph, so the two numbers add up to the same 14px of air — and
              the pill's box starts a few pixels clear of the swatch, which is
              what makes them read as two targets rather than one. The negative
              margin is gone with it: the swatch holds the left margin now, so
              the name has no edge to line up with. */}
            <h1 className="flex min-w-0 flex-1 items-center gap-1 font-display text-[28px] font-medium leading-tight text-ink">
              {tag ? (
                <>
                  <TagHueButton tag={tag} hue={hueOf(tag)} />
                  {/* The name is the rename control. It is the one piece of a
                    tag that is *made of* the thing it edits, so clicking the
                    word to change the word needs no glyph to explain it — the
                    pencil is there for the first time only, and the pill's
                    tint is the standing cue that the word is live. Same
                    dialog the rail's menu opens; there is one rename in this
                    app, reachable from two places. */}
                  <button
                    type="button"
                    onClick={() => setRenaming(true)}
                    aria-label={`Rename ${title} everywhere`}
                    aria-haspopup="dialog"
                    className="tag-pill group flex min-w-0 items-center gap-3 rounded-full px-2.5 py-0.5 text-left"
                  >
                    <span className="min-w-0 truncate">{title}</span>
                    {/* Held in layout at all times, revealed on reach:
                      appearing from nothing would resize the pill under the
                      pointer. */}
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 shrink-0 text-ink-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                    >
                      <path d="M4 20h4l10-10-4-4L4 16v4z" />
                      <path d="m13.5 6.5 4 4" />
                    </svg>
                  </button>
                </>
              ) : (
                title
              )}
            </h1>

            {/* Search and pin, in that order: the one you reach for constantly
              and the one you press once. Both are the 28px circle the note
              header's controls are, so a header control is the same object
              wherever it appears.

              The search is on every one of these lists, not just a tag's. It
              was tag-only on the argument that All notes and Untagged have no
              scope to search inside, which mistook the button for a filter —
              it opens the palette, and the palette is as useful standing in
              front of everything as it is inside one tag. What differs is only
              what it says: a tag names its scope, the other two don't, because
              there the palette searches the collection. The pin and the delete
              stay tag-only; there is nothing to pin or delete here. */}
            {/* The words the palette will open wearing: it reads the route and
              seeds its own chip from it, so a button that promised anything
              else would be describing a different search. See [scopeFromPath].
              `heading` is only ever Untagged today, and lower-cased it is
              exactly what that scope is called in a sentence. */}
            <HeaderSearchButton
              label={
                tag
                  ? `Search ${title}`
                  : heading
                    ? `Search ${heading.toLowerCase()} notes`
                    : "Search notes"
              }
              hint={tag ? `Search inside ${title}` : "Search your notes"}
            />

            {tag && (
              <>
                <TagPinButton tag={tag} />
                {/* Last of the three, and the only one that goes red on
                    reach: the order is how often you press them, and this is
                    the one you press once ever. It sits here rather than in a
                    ⋯ menu because this header has never had one — the rename
                    is the title itself — and a menu holding a single item is
                    a lid on one button. */}
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  aria-label={`Delete ${title}`}
                  aria-haspopup="dialog"
                  title={`Delete ${title}`}
                  className="row-tint flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-danger-wash hover:text-danger"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                  >
                    <path d="M4 7h16" />
                    <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" />
                    <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
                    <path d="M10 11.5v5.5M14 11.5v5.5" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {tag && renaming && (
            <TagRenameDialog
              tag={tag}
              // The live count, not the server's: rows deleted a moment ago are
              // already gone from this list and shouldn't be counted in a
              // sentence about what is about to be rewritten.
              noteCount={liveNotes.length}
              onClose={() => setRenaming(false)}
            />
          )}

          {tag && deleting && (
            <TagDeleteDialog
              tag={tag}
              // The live count for the same reason as above: rows deleted a
              // moment ago are already gone from this list and shouldn't be
              // counted in a sentence about what is about to go.
              noteCount={liveNotes.length}
              onClose={() => setDeleting(false)}
            />
          )}

          {notes.length === 0 ? (
            // Two different emptinesses. An index with nothing in it is a
            // question about tags; the *root* index with nothing in it is a
            // collection that doesn't exist yet, and the only useful thing to
            // say there is how to start one — including the way in that has no
            // button anywhere on this screen.
            tag === null && !heading ? (
              <p className="pt-[var(--space-block)] text-base text-ink-muted">
                Nothing here yet.{" "}
                <Link
                  href="/notes/new"
                  className="text-action underline-offset-2 hover:underline"
                >
                  Create your first note
                </Link>
                <span aria-hidden className="px-1.5 text-ink-faint">
                  ·
                </span>
                <button
                  type="button"
                  onClick={requestNoteImport}
                  className="text-action underline-offset-2 hover:underline"
                >
                  or import .md and .txt files from your computer
                </button>
              </p>
            ) : (
              <p className="pt-[var(--space-block)] text-base text-ink-muted">
                Nothing here yet. Tags come from the notes themselves — type{" "}
                <span className="font-mono text-[13px]">
                  #{tag ?? "something"}
                </span>{" "}
                in a note and it will show up.
              </p>
            )
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
                      // Inside a tag, every row is that tag's hue: it's the one
                      // the pane is already washed in, and the one the note will
                      // still be wearing after the click — a row lit in its own
                      // first tag would change colour on the way in. On the
                      // all-notes view there is no pane hue to inherit, so a row
                      // carries its own first tag's instead. A note with no tags
                      // has no hue to be lit in either way and falls back to the
                      // neutral ink tint — inventing one would be the interface
                      // claiming a note is filed when it isn't.
                      const rowTag = tag ?? note.tags[0];
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
                            // Carries the tag this list *is*, so the note opens
                            // showing the index it was opened from rather than
                            // guessing at one from its own tags.
                            href={noteHref(note.slug, tag)}
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
      </PaneScroller>
    </div>
  );
}
