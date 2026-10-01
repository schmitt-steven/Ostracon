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
import { forgetPin, notePinKey } from "@/lib/tags/preferences";
import { ALL_NOTES_HREF, noteHref, UNTAGGED_HREF } from "@/lib/tags/routes";
import { washLights, washVars } from "@/lib/ui/wash";
import { ContentBody } from "@/components/shell/ContentBody";
import { TagDeleteDialog } from "@/components/tags/TagDeleteDialog";
import { TagRenameDialog } from "@/components/tags/TagRenameDialog";
import { Asterism } from "./Asterism";
import { DeleteRowButton } from "./DeleteRowButton";
import { TagHueButton } from "./TagHueButton";
import { TagPinButton } from "./TagPinButton";
import { HeaderSearchButton } from "@/components/ui/HeaderSearchButton";
import { SortControl } from "@/components/ui/SortControl";
import {
  SORT_DATE_FIELD,
  SORT_LABEL,
  SORT_MODES,
  type SortMode,
} from "./note-sort";
import { EditIcon, PlusIcon, TrashIcon } from "@/icons";

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
  // Measured server-side, markup discounted (notes/text-length); ties by title.
  longest: (a, b) =>
    b.textLength - a.textLength || a.title.localeCompare(b.title),
};

/**
 * A note-list view (one tag, all notes, or untagged). Searching is in ⌘K,
 * which opens narrowed to this view's tag. Rows are separated by space alone
 * (--space-row / --space-hair) and are all the same height — in a rule-less
 * list, uneven heights read as disorder.
 */
export function IndexView({ notes, tag, heading }: Props) {
  const router = useRouter();
  const { hueOf } = useTagHues();
  const [sort, setSort] = useState<SortMode>("edited");
  // -1 = nothing selected, where the list starts.
  const [cursor, setCursor] = useState(-1);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // Rows hidden on confirm, not on the server's answer; a failed delete
  // restores the id.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();

  const handleDelete = useCallback((id: string) => {
    setDeletedIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      try {
        await deleteNote(id);
        // As [NoteDeleteButton]: the order stops naming a note that's gone.
        forgetPin(notePinKey(id));
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

  // j/k/Enter — ignored while typing, and inside a menu or the control that
  // opens one (the sort menu is our own now, so the fence is explicit).
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

  // Keep the selected row in view when the arrows walk past the fold.
  useEffect(() => {
    if (cursor < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const hue = tag ? hueOf(tag) : undefined;
  const title = tag ? `#${tag}` : (heading ?? "All notes");
  // The root view — the only one that wants a "how the collection breaks down"
  // line.
  const allNotes = !tag && !heading;

  // Live count — a just-deleted row shouldn't still be in the sentence.
  const untaggedCount = useMemo(
    () =>
      allNotes ? liveNotes.filter((note) => note.tags.length === 0).length : 0,
    [allNotes, liveNotes],
  );

  // The editor's wash, from the same file — this view's one tag, or
  // neutral on All notes / Untagged.
  const contentStyle = useMemo(() => {
    const vars: Record<string, string> = washVars(
      washLights(tag ? [tag] : [], hueOf),
    );
    if (hue !== undefined) vars["--h"] = String(hue);
    return vars as React.CSSProperties;
  }, [tag, hue, hueOf]);

  return (
    // content-etched, matching the note — the two surfaces you read. See `.content-etched`.
    <div className="content content-etched h-full" style={contentStyle}>
      <ContentBody
        head={
          <header className="content-head">
            <div className="mx-auto flex min-h-[var(--head-h)] max-w-[680px] items-center gap-4 px-6 py-4">
              {/* -ml-1.5 cancels the pill's padding so it lines up with the heading. */}
              <nav
                aria-label="Breadcrumb"
                className="-ml-1.5 flex min-w-0 flex-1 items-center text-ui"
              >
                <Link
                  href={ALL_NOTES_HREF}
                  className="tag-pill tag-pill-ink shrink-0 whitespace-nowrap rounded-full px-1.5 py-1 text-ink-muted"
                >
                  All notes
                </Link>
                {(tag ?? heading) && (
                  <>
                    <span aria-hidden className="text-ink-faint">
                      /
                    </span>
                    <span className="min-w-0 truncate px-1.5 text-ink">
                      {title}
                    </span>
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
                  // Re-sorting moves rows under the cursor.
                  setCursor(-1);
                }}
              />
            </div>
          </header>
        }
      >
        <div className="mx-auto max-w-[680px] px-6 pb-24">
          {/* On a tag view: swatch, name (the rename control), search, pin —
              each its own target. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3 pt-2">
            <h1
              className={`flex min-w-0 flex-1 items-center gap-1 font-display text-[28px] max-[999px]:text-[32px] ${tag ? "max-[999px]:basis-full" : ""} font-medium leading-tight text-ink`}
            >
              {tag ? (
                <>
                  <TagHueButton tag={tag} hue={hueOf(tag)} />
                  {/* The name is the rename control — clicking the word to
                      change the word needs no glyph. Same dialog as the
                      sidebar. */}
                  <button
                    type="button"
                    onClick={() => setRenaming(true)}
                    aria-label={`Rename ${title} everywhere`}
                    aria-haspopup="dialog"
                    className="tag-pill group flex min-w-0 items-center gap-3 rounded-full px-2.5 py-0.5 text-left"
                  >
                    <span className="min-w-0 truncate">{title}</span>
                    {/* Held in layout, revealed on reach. */}
                    <EditIcon
                      aria-hidden
                      className="icon shrink-0 text-ink-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                    />
                  </button>
                </>
              ) : (
                title
              )}
            </h1>

            {/* On a tag, the new note starts filed under it. */}
            <Link
              href={
                tag
                  ? `/notes/new?${new URLSearchParams({ tag })}`
                  : "/notes/new"
              }
              data-hued={tag ? "" : undefined}
              title={tag ? `New note in ${title}` : "New note"}
              className={`action-pill flex h-7 max-[999px]:h-9 shrink-0 items-center gap-1.5 rounded-full pl-2 pr-3 text-ui font-medium transition-colors ${
                tag ? "hue-text" : "text-ink"
              }`}
            >
              <PlusIcon aria-hidden className="icon shrink-0" />
              New note
            </Link>

            {/* Search on every list (not just a tag's — it opens the search
              menu); pin and delete are tag-only. The label matches what the
              search menu opens wearing (see [scopeFromPath]). */}
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
                {/* Delete — last, the only one that goes red; no ⋯ menu. */}
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  aria-label={`Delete ${title}`}
                  aria-haspopup="dialog"
                  title={`Delete ${title}`}
                  className="row-tint flex tap shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-danger-wash hover:text-danger"
                >
                  <TrashIcon aria-hidden className="icon" />
                </button>
              </>
            )}
          </div>

          {/* How the collection breaks down — the count appears only while
              there's something behind it. One link (untagged); no `/tagged`. */}
          {allNotes && (
            <p className="mt-[var(--space-hair)] text-ui text-ink-muted">
              {liveNotes.length} {liveNotes.length === 1 ? "note" : "notes"}
              {untaggedCount > 0 && (
                <>
                  <span aria-hidden className="px-1.5 text-ink-faint">
                    ·
                  </span>
                  <Link
                    href={UNTAGGED_HREF}
                    className="text-action underline-offset-2 hover:underline"
                  >
                    {untaggedCount} untagged
                  </Link>
                </>
              )}
            </p>
          )}

          {tag && renaming && (
            <TagRenameDialog
              tag={tag}
              // The live count — a just-deleted row isn't in what's rewritten.
              noteCount={liveNotes.length}
              onClose={() => setRenaming(false)}
            />
          )}

          {tag && deleting && (
            <TagDeleteDialog
              tag={tag}
              // The live count, as above.
              noteCount={liveNotes.length}
              onClose={() => setDeleting(false)}
            />
          )}

          {notes.length === 0 ? (
            // An empty root index is a collection that doesn't exist yet — say
            // how to start one. An empty tag/Untagged index just says so.
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
                {tag
                  ? `No notes filed under #${tag} yet.`
                  : "Nothing here yet."}
              </p>
            )
          ) : (
            <>
              {sorted.length === 0 ? (
                // Everything here was just deleted; the server's `notes` hasn't
                // caught up.
                <p className="pt-[var(--space-block)] text-base text-ink-muted">
                  Nothing left here.
                </p>
              ) : (
                <>
                  <ul ref={listRef} className="pt-[var(--space-block)]">
                    {sorted.map((note, index) => {
                      // Inside a tag: that tag's hue (the content's, and what the
                      // note keeps after the click). On all-notes: the note's
                      // own first tag, or the neutral tint when it has none.
                      const rowTag = tag ?? note.tags[0];
                      return (
                        <li
                          key={note.id}
                          data-row={index}
                          // has() lifts the row above its siblings while its
                          // dialog is open.
                          className="group/row relative mb-[var(--space-row)] max-[999px]:mb-4 last:mb-0 has-[[role=dialog]]:z-10"
                        >
                          <Link
                            // Carries this list's tag, so the note opens under it.
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
                            className={`bleed-row block py-1.5 group-has-[[data-row-delete-trigger]:hover]/row:!bg-danger-wash ${
                              rowTag ? "hue-row" : "row-tint"
                            }`}
                          >
                            <span className="flex items-baseline gap-4">
                              <span className="min-w-0 flex-1 truncate font-display text-base max-[999px]:text-xl font-medium text-ink group-has-[[data-row-delete-trigger]:hover]/row:text-danger group-has-[[data-row-delete-trigger]:hover]/row:line-through">
                                {note.title || "Untitled"}
                              </span>
                              <RelativeDate
                                date={note[SORT_DATE_FIELD[sort]]}
                                // Yields the corner to the delete control on hover.
                                className="shrink-0 whitespace-nowrap text-ui tabular-nums text-ink-muted transition-opacity group-hover/row:opacity-0"
                              />
                            </span>
                            {/* Always rendered, even when empty, so rows stay
                          the same height. */}
                            <span className="mt-[var(--space-hair)] flex min-w-0 items-baseline gap-1.5 text-ui text-ink-muted">
                              {/* flex-1 pushes the tags flush right, under the
                          date; it still truncates first. */}
                              <span className="min-w-0 flex-1 truncate">
                                {note.snippet}
                              </span>
                              {note.tags
                                // Not this list's own tag.
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
                          </Link>
                          {/* A sibling of the Link (no button inside an anchor).
                            On the title line, clear of the tags. */}
                          <div className="absolute right-0 top-1">
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

        {/* Announced — the sort has no visible label. */}
        <p className="sr-only" role="status">
          Sorted by {SORT_LABEL[sort]}
        </p>
      </ContentBody>
    </div>
  );
}
