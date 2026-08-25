"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { RelativeDate } from "@/components/ui/RelativeDate";
import { useSearchIndex, type NoteHit } from "@/hooks/use-search-index";
import { useTagHues } from "@/hooks/use-tag-hues";
import {
  getContextualCommands,
  getServerContextualCommands,
  subscribeContextualCommands,
} from "@/lib/command/registry";
import {
  getPaletteEverOpened,
  getServerPaletteEverOpened,
  subscribePaletteOpen,
} from "@/lib/command/palette-state";
import {
  scopeFromPath,
  scopeLabel,
  scopePrompt,
  scopeTag,
  type PaletteScope,
} from "@/lib/command/scope";
import { requestNoteImport } from "@/lib/notes/import-request";
import {
  countMatches,
  excerpt,
  highlight,
  snippet,
} from "@/lib/search/highlight";
import { normalizeTag, tagMatches } from "@/lib/tags/parse";
import {
  ALL_NOTES_HREF,
  noteHref,
  tagHref,
  TAGS_HREF,
  UNTAGGED_HREF,
} from "@/lib/tags/routes";
import { Highlighted } from "./Highlighted";
import { PalettePreview } from "./PalettePreview";
import type { ActionIcon, PaletteAction, Row, Section } from "./types";

type Props = {
  /** Every tag in use, for the Tags section and for a scope's sub-tags. */
  tags: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * How many notes a search shows. The count in the header is the honest total.
 *
 * Tuned to the frame rather than chosen round: the list column is a fixed
 * height, so a limit below what fits leaves dead space under the last row and
 * a limit above it hides rows behind a scroll nobody asked for.
 */
const NOTE_LIMIT = 10;
/** How many notes the query-less list shows. */
const RECENT_LIMIT = 5;
/** How many tags the Tags section offers before it is cut. */
const TAG_LIMIT = 5;
/**
 * And how many when the tags lead — under the tag directory's scope.
 *
 * More than the section gets when it follows the notes, and deliberately less
 * than fills the column: the notes are still down there, and a lead section
 * that took the whole frame would leave the first of them hidden under a fold
 * with nothing to say it was there. Six leaves a note row or two showing.
 */
const TAG_LEAD_LIMIT = 6;
/**
 * Long enough to swallow the gap between keystrokes at speed, short enough
 * that the list has already moved by the time the eye leaves the field.
 */
const DEBOUNCE_MS = 80;

/**
 * ⌘K is how you get somewhere, and what you do to the note you're on.
 *
 * That's the trade the design makes: the header carries the two or three
 * things you use while looking at the thing itself, and the verbs that act on
 * a note — jumping to one, making one, suggesting tags for one, switching its
 * mode — live here rather than as buttons somewhere. Persistent chrome is what
 * the old interface had too much of; a palette costs nothing until it's asked
 * for.
 *
 * Account settings are the line: theme and log out sit in the rail, where they
 * are already one visible click away. Things you do *to a note* belong here;
 * things you do to the session do not.
 *
 * Three rules hold the rest of it together:
 *
 * **The frame never moves.** Two columns in every state — a highlighted tag or
 * action gets a summary in the right pane rather than collapsing it, and a
 * search with no results keeps the frame and explains itself inside it. A
 * palette that resizes as you arrow down a list is one you cannot read while
 * it changes.
 *
 * **Sections are in a fixed order** — Notes, Tags, Actions with a query;
 * Recent, Actions without one. Nothing re-sorts on relevance across sections,
 * so the row your hand is reaching for is where it was last time. The tag
 * directory's chip swaps the first two and nothing else, and it says so on
 * screen the whole time it is doing it.
 *
 * **Every row says why it is there.** A title that visibly doesn't contain
 * what you typed, sitting in a list with no explanation, reads as the search
 * being broken — so a tag-only match says so in as many words. The reason is
 * computed in the search layer (lib/search/results) because it decides the
 * row's order as well as its wording.
 *
 * **Each fact has one home.** The scope lives on the chip — its name, whether
 * sub-tags are swept in, and the × that drops it. Headings name a kind and
 * never the scope, the footer lists keys and never rules, and the count says
 * `4 notes · 2 tags` rather than totalling two things you'd open differently.
 * The rule this replaced had the sub-tag fact in three places and three
 * wordings, one of them glob syntax.
 *
 * Two verbs on top of "open": ⇥ narrows the search to the highlighted tag, and
 * typing `#infra` followed by a space narrows to that tag directly, since a
 * hashtag means the same thing here as it does in a note's body. A `#` typed
 * in front of anything else is stripped before matching rather than switching
 * the list into a mode of its own — `#infra` and `infra` find the same things.
 */
export function CommandPalette({ tags, open, onOpenChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  // What the list is actually built from. Trails `query` by one debounce so a
  // fast typist rebuilds the sections once instead of once per keystroke.
  const [deferred, setDeferred] = useState("");
  /**
   * The highlighted row, stamped with the list it was chosen in.
   *
   * The stamp is what sends the highlight home when the query or the scope
   * changes: a new list is a new question, and a highlight left on whatever
   * the mouse last passed over means the preview pane goes on describing a
   * note that has nothing to do with what is now typed. A stale stamp resolves
   * to no highlight, which resolves to the first row — the best answer to the
   * query by definition.
   *
   * Derived rather than reset in an effect, because an effect that sets state
   * renders the stale highlight for a frame first, and this project's compiler
   * rejects it outright.
   */
  const [mark, setMark] = useState<{ list: string; id: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { hueOf } = useTagHues();

  // The corpus fetch is deferred until the palette has been opened at least
  // once, and stays loaded afterwards. The latch lives in the store rather
  // than in state here, so opening it doesn't have to round-trip through an
  // effect to start the fetch.
  const everOpened = useSyncExternalStore(
    subscribePaletteOpen,
    getPaletteEverOpened,
    getServerPaletteEverOpened,
  );
  const { search, recent, tagCounts, tagLastUsed } = useSearchIndex(everOpened);

  const contextual = useSyncExternalStore(
    subscribeContextualCommands,
    getContextualCommands,
    getServerContextualCommands,
  );

  // What the route is looking at, read from the pathname rather than threaded
  // down: a page telling a component mounted above the router where it is
  // would be a thing every route has to remember. See [scopeFromPath].
  const routeScope = scopeFromPath(pathname);

  // What this opening did to the scope: `undefined` is "hasn't touched it",
  // `null` is "dropped it", a scope is "picked that one". Three states rather
  // than two because the resting scope is the route's — searching from inside
  // `#infra` almost always means searching `#infra` — and "dropped" has to be
  // tellable from "not yet decided", or widening the search would last exactly
  // one render before the route seeded it again.
  const [override, setOverride] = useState<PaletteScope | null | undefined>(
    undefined,
  );
  const scope = override === undefined ? routeScope : override;

  /**
   * The tag directory's scope: tags lead, notes follow.
   *
   * The odd one of the three, and the only one that isn't a filter — it
   * changes the order of the list rather than what is eligible for it. Every
   * note is still searched and still listed, below the tags, because a chip
   * that could *hide* results would be the one scope you have to drop before
   * you can trust the palette. What it buys is that on the page whose whole
   * subject is tags, the tags are the rows your hand lands on.
   */
  const tagsFirst = scope?.kind === "tags";

  // Whether the scope actually gathers anything beneath it. The `+ sub` toggle
  // only appears when there is a `#vercel/…` to include or leave out —
  // otherwise it would be a switch that changes nothing, sitting next to a
  // count that never moves. Tags only: neither of the other two has a tree.
  const scopeHasChildren =
    scope?.kind === "tag" &&
    tags.some((name) => name !== scope.name && tagMatches(name, scope.name));

  /**
   * Whether the scope sweeps in what is filed beneath it.
   *
   * Stated in exactly one place — the chip — and stated as a control rather
   * than as prose, because it is a thing people flip rather than a rule they
   * need reminding of. Sticky across scope changes within one opening: someone
   * who just said "this tag only" means it for the next tag too. `close()`
   * puts it back, since the next opening is a new question.
   */
  const [subtags, setSubtags] = useState(true);

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setDeferred("");
    setMark(null);
    setOverride(undefined);
    setSubtags(true);
  }, [onOpenChange]);

  // The debounce. Guarded on equality so settling doesn't re-arm the timer.
  useEffect(() => {
    if (query === deferred) return;
    const timer = setTimeout(() => setDeferred(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, deferred]);

  /**
   * Point the search at a tag, and stay open: narrowing is the setup for a
   * search, not the search. The name comes out of the field so it isn't then
   * also matched against titles — whatever you typed to find the tag has done
   * its job.
   */
  const narrowTo = useCallback((name: string) => {
    setOverride({ kind: "tag", name });
    setQuery("");
    setDeferred("");
    setMark(null);
  }, []);

  const dropScope = useCallback(() => {
    setOverride(null);
    setMark(null);
  }, []);

  /**
   * Whether a name is a tag you could actually search.
   *
   * `tagCounts` is the better answer because it carries *ancestors* — `#infra`
   * is a real index in a collection where everything is filed at `#infra/ci`
   * and nothing at `#infra` — but it is empty until the corpus lands, so the
   * tag list passed in covers the first second of the palette's life.
   */
  const isTag = useCallback(
    (name: string) =>
      tagCounts.has(name) ||
      tags.some((tag) => tag === name || tagMatches(tag, name)),
    [tagCounts, tags],
  );

  /**
   * Typing, with one word taken to mean what it means everywhere else.
   *
   * `#vercel` followed by a space is how you name a tag in a note's body and in
   * the tag bar, so here it narrows to that tag instead of sitting in the field
   * as text. The `#` is required: `vercel ` stays a search, because a bare word
   * that silently turned into a filter would be a keystroke you can't take
   * back. So is the exact name — a prefix that matched one tag *today* would
   * start narrowing to a different one the week a second tag shared it.
   */
  const onQueryChange = useCallback(
    (value: string) => {
      const typed = /^\s*#([^\s#]+)\s$/.exec(value);
      const name = typed ? normalizeTag(typed[1]!) : null;
      if (name && isTag(name)) {
        narrowTo(name);
        return;
      }
      setQuery(value);
    },
    [isTag, narrowTo],
  );

  // A leading `#` is how tags are written everywhere else in the app, so it is
  // accepted and ignored rather than made to mean something extra.
  const needle = deferred.trim().replace(/^#+/, "").trim().toLowerCase();

  // Which list the rows below belong to. Everything that rebuilds them is in
  // here, and nothing that doesn't — `query` is left out on purpose, so the
  // highlight survives the keystrokes inside a debounce rather than flickering
  // home and back while the list underneath it hasn't moved yet.
  const listKey = `${needle} ${scope ?? ""} ${subtags}`;
  const activeId = mark?.list === listKey ? mark.id : null;
  const setActiveId = useCallback(
    (id: string) => setMark({ list: listKey, id }),
    [listKey],
  );

  // `total` is what the header reports; `hits` is the slice that fits. With no
  // query the two are the same thing and the header shows neither.
  const { hits: noteHits, total } = useMemo<{
    hits: NoteHit[];
    total: number;
  }>(() => {
    if (needle) return search(needle, scope, NOTE_LIMIT, subtags);
    const hits = recent(RECENT_LIMIT, scope, subtags);
    return { hits, total: hits.length };
  }, [needle, scope, subtags, search, recent]);

  /**
   * The tags the query matches, and how many there are.
   *
   * Two things need it and they need different halves: the list shows the
   * first few, and the header reports the honest total. Independent of the
   * notes, too — a query that matches a tag and no note has still found
   * something, and a Tags section that appeared only when notes did would make
   * the header's count claim rows the list never showed.
   *
   * Under the tag directory's scope it is the leading section rather than the
   * second one, so it stands without a query — every tag, most recently
   * written in first, which is the order that view itself opens in. Elsewhere
   * an unqueried Tags section would be a copy of the rail's old tag tree
   * sitting on top of the Recent notes nobody asked to leave.
   */
  const { rows: tagRows, total: tagTotal } = useMemo<{
    rows: Row[];
    total: number;
  }>(() => {
    if (!needle && !tagsFirst) return { rows: [], total: 0 };
    const matched = tags.filter(
      (name) =>
        name !== scopeTag(scope) &&
        (!needle || name.toLowerCase().includes(needle)),
    );
    // Recency only where the tags lead. A Tags section under matching notes
    // keeps the order the tags came in, which is the order the shell hands
    // them over in — re-sorting a five-row afterthought by a date the rows
    // don't show is an order the reader can't see the reason for.
    if (tagsFirst) {
      matched.sort((a, b) =>
        (tagLastUsed.get(b) ?? "").localeCompare(tagLastUsed.get(a) ?? ""),
      );
    }
    return {
      rows: matched
        .slice(0, tagsFirst ? TAG_LEAD_LIMIT : TAG_LIMIT)
        .map((name) => ({
          id: `tag:${name}`,
          kind: "tag",
          name,
          count: tagCounts.get(name) ?? 0,
        })),
      total: matched.length,
    };
  }, [needle, tagsFirst, scope, tags, tagCounts, tagLastUsed]);

  /**
   * What this query would have found without the scope.
   *
   * Only asked when the scope came back empty, which is the one moment the
   * number is worth having: "nothing here" and "nothing anywhere" are
   * different problems with different next moves, and the palette already
   * knows which one this is. A limit of zero because only the count is wanted
   * — the rows would be thrown away.
   */
  const wideTotal = useMemo(() => {
    if (!needle || !scope) return 0;
    // Nothing to widen to under the directory's chip: it orders the list, it
    // doesn't narrow it, so the notes it found are already every note there is
    // and a row offering to search them again would be a fix for a problem the
    // scope can't cause.
    if (tagsFirst || noteHits.length > 0) return 0;
    return search(needle, null, 0).total;
  }, [needle, scope, tagsFirst, noteHits.length, search]);

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];

    // Getting notes in from outside. It is the same verb as "New note" from
    // the other side, so it sits beside it — and the detail line names the
    // gesture that does the same thing, since one nobody knows about is one
    // nobody uses.
    const importFiles: PaletteAction = {
      id: "import",
      label: "Import files",
      detail: ".md or .txt files become notes · or drag & drop them",
      icon: "upload",
      run: requestNoteImport,
    };
    const importMatches =
      !needle ||
      commandMatches(
        importFiles.label,
        // "markdown" is in here rather than in the label: it is the word most
        // people would reach for, and the label no longer says it.
        "upload import markdown md txt text file drag drop",
        needle,
      );

    // Nothing found: the ways out, in the order you would reach for them.
    // Typing the name of a command counts as one of them — a search for
    // "import" that finds no notes has still found what it was after, and
    // burying it under "New note titled import" would answer the wrong
    // question with the row Return is sitting on.
    // Where the tags lead, a query that turned up four of them has found what
    // it went for even if no note matched — the ways out belong under a list
    // that is empty, not under one whose first section is full.
    const foundNothing =
      noteHits.length === 0 && (!tagsFirst || tagRows.length === 0);
    if (needle && foundNothing) {
      if (importMatches) list.push(importFiles);
      list.push(newNote(router, needle, scopeTag(scope)));
      return list;
    }

    // The two ways to make a note, in a pair: one from nothing, one from
    // files you already have. "Go to all notes" is a navigation and follows
    // them rather than sitting between them.
    list.push(newNote(router, needle, scopeTag(scope)));
    if (importMatches) list.push(importFiles);

    // What the view you are looking at can do comes before the navigations:
    // it is about the note already in front of you, so it is the shorter reach.
    for (const command of contextual) {
      if (needle && !commandMatches(command.label, command.keywords, needle)) {
        continue;
      }
      list.push({
        id: `cmd:${command.id}`,
        label: command.label,
        // Falls back to the group because a contextual command is registered
        // by the view it belongs to, and "Editor" is a true answer to "why is
        // this here" even when nobody wrote a better one.
        detail: command.detail ?? command.group,
        icon: command.icon ?? "run",
        shortcut: command.shortcut,
        run: command.run,
      });
    }

    if (!needle) {
      list.push({
        id: "all-notes",
        label: "Go to all notes",
        detail: "Every note, newest first",
        icon: "run",
        run: () => router.push(ALL_NOTES_HREF),
      });
    }

    // Worth a row of its own now that the rail lists no tags: this is the
    // only way to *browse* them rather than name one, and the palette is
    // where half of this app's navigation is reached from.
    if (
      !needle ||
      commandMatches("Go to all tags", "directory index", needle)
    ) {
      list.push({
        id: "tags",
        label: "Go to all tags",
        detail: "Every tag, with its notes counted",
        icon: "tag",
        run: () => router.push(TAGS_HREF),
      });
    }

    if (
      !needle ||
      commandMatches("Go to untagged notes", "orphan none", needle)
    ) {
      list.push({
        id: "untagged",
        label: "Go to untagged notes",
        detail: "Notes that were never filed",
        icon: "tag",
        run: () => router.push(UNTAGGED_HREF),
      });
    }

    return list;
  }, [
    needle,
    tagsFirst,
    tagRows.length,
    noteHits.length,
    scope,
    contextual,
    router,
  ]);

  const sections = useMemo<Section[]>(() => {
    const actionSection: Section = {
      heading: "Actions",
      rows: actions.map((action) => ({
        id: `action:${action.id}`,
        kind: "action",
        action,
      })),
    };

    const noteRows: Row[] = noteHits.map((note) => ({
      id: `note:${note.slug}`,
      kind: "note",
      note,
    }));

    const tagSection: Section[] =
      tagRows.length > 0 ? [{ heading: "Tags", rows: tagRows }] : [];

    /**
     * The scoped miss, as a row rather than as a shrug.
     *
     * A search that found nothing under `#vercel` while four notes match
     * elsewhere is the commonest way a scope goes wrong, and both numbers are
     * already in hand — so the palette says which is which and puts the fix
     * one Return away. First in the list, which is where a query's stamped
     * highlight lands: the "one key" is the key you were already going to
     * press.
     *
     * Not filed under Actions. Everything there acts on the collection or the
     * note; this changes what the field is pointed at, which is the same
     * category as the chip beside it.
     */
    const widenSection: Section[] =
      wideTotal > 0
        ? [
            {
              heading: "No matches",
              rows: [
                {
                  id: "action:widen",
                  kind: "action" as const,
                  action: {
                    id: "widen",
                    // `scope` is non-null wherever this row exists: wideTotal
                    // is only ever counted under one.
                    label: `0 in ${scopeLabel(scope!)} · ${wideTotal} in all notes`,
                    detail: "Search every note instead",
                    icon: "search" as const,
                    shortcut: "⏎",
                    keepOpen: true,
                    run: dropScope,
                  },
                },
              ],
            },
          ]
        : [];

    // Headings below name a kind and never the scope: the chip above the field
    // is where the scope is stated, and "Notes in #vercel" over a list already
    // sitting under a `#vercel` chip is one fact in two wordings.
    //
    // Under the tag directory's chip the tags go on top and the notes keep
    // the section they would have had anyway — Notes with a query, Recent
    // without one. Same rows, same order within each, read in the other order:
    // on the page that is about tags, a tag is the row Return is sitting on,
    // and the note you were actually after is one arrow-down away rather than
    // one chip-drop away.
    if (tagsFirst) {
      return [
        ...tagSection,
        { heading: needle ? "Notes" : "Recent", rows: noteRows },
        actionSection,
      ];
    }

    // No query: what you last touched first, then the verbs. Opening the
    // palette with nothing typed is almost always on the way back to a note
    // you were just in, so the shorter reach goes to that list and the
    // highlight rests on the newest of them.
    if (!needle) {
      return [{ heading: "Recent", rows: noteRows }, actionSection];
    }

    // No note matched: the frame stays and the Notes section gives way to the
    // widen row, or to the sentence above the list when there is nothing wider
    // to offer. Tags still show — a tag row is a result the header has already
    // counted, and narrowing to one clears the query rather than searching
    // further into nothing.
    if (noteRows.length === 0) {
      return [...widenSection, ...tagSection, actionSection];
    }

    return [{ heading: "Notes", rows: noteRows }, ...tagSection, actionSection];
  }, [
    needle,
    scope,
    tagsFirst,
    noteHits,
    actions,
    tagRows,
    wideTotal,
    dropScope,
  ]);

  const rows = useMemo(
    () => sections.flatMap((section) => section.rows),
    [sections],
  );

  // The highlight is stored as the row's identity and resolved to an index on
  // every render, rather than stored as an index. That is what keeps it on the
  // same note when a keystroke re-ranks the list under it — an index would
  // hold still while the row beneath it changed, which is the one behaviour
  // that makes a palette dangerous to type into quickly.
  const activeIndex = Math.max(
    0,
    rows.findIndex((row) => row.id === activeId),
  );
  const active = rows[activeIndex];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }
      // `/` used to put the caret in the rail's tag filter. That field is gone
      // and this is where its job went, so the key follows it rather than
      // becoming one that does nothing. Ignored while typing into anything,
      // and while a modifier is down, so it can't steal a slash mid-sentence.
      if (open || event.key !== "/") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, .cm-editor")
      ) {
        return;
      }
      event.preventDefault();
      onOpenChange(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // The caret comes back to the field after the scope changes. Both verbs that
  // change it can be reached with the mouse — the chip's × and a tag row — and
  // the palette is unusable the moment the field isn't the thing typing goes
  // into. Kept here rather than in those handlers so the ref is only ever
  // touched in an effect.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, override]);

  // Keeps the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-row-id="${CSS.escape(activeId ?? "")}"]`,
      )
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  if (!open) return null;

  function move(delta: number) {
    if (rows.length === 0) return;
    const next = (activeIndex + delta + rows.length) % rows.length;
    setActiveId(rows[next]!.id);
  }

  function choose(row: Row) {
    if (row.kind === "action") {
      if (!row.action.keepOpen) close();
      row.action.run();
      return;
    }
    close();
    // A scoped search is an index too: picking a note out of "Notes in #infra"
    // opens it under #infra, the same as clicking it in that tag's list.
    if (row.kind === "note")
      router.push(noteHref(row.note.slug, scopeTag(scope)));
    else router.push(tagHref(row.name));
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      move(1);
    } else if (
      event.key === "ArrowUp" ||
      (event.key === "p" && event.ctrlKey)
    ) {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active) choose(active);
    } else if (event.key === "Tab" && !event.shiftKey) {
      // Only swallowed over a tag row, where it means something. Everywhere
      // else it stays the key that moves focus.
      if (active?.kind !== "tag") return;
      event.preventDefault();
      narrowTo(active.name);
    } else if (event.key === "Backspace") {
      // Only when there is nothing to the left of the caret to delete. A
      // ⌫ that erases a character *sometimes* and drops the scope other times
      // is a key you stop trusting; this one only reaches the chip once the
      // field is genuinely empty.
      const caret = event.currentTarget.selectionStart ?? 0;
      const selected = event.currentTarget.selectionEnd ?? 0;
      if (!scope || query !== "" || caret !== 0 || selected !== 0) return;
      event.preventDefault();
      dropScope();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  // The sentence over the list, for the miss nothing else explains. It stands
  // down as soon as a row can do the job better: the widen row already says
  // `0 in #vercel · 4 in all notes`, and a Tags section is a result, so
  // "Nothing matches" printed above one would be contradicting the list.
  //
  // It names the scope only where the scope ruled something out. Under the
  // directory's chip every note was searched, so "in All tags" would blame an
  // empty result on a chip that had nothing to do with it.
  const emptyLine =
    needle && noteHits.length === 0 && wideTotal === 0 && tagRows.length === 0
      ? `Nothing matches “${deferred.trim()}”${
          scope && !tagsFirst ? ` in ${scopeLabel(scope)}` : ""
        }`
      : null;

  return (
    <div
      className="scrim fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        // Fixed size, on purpose. Every state below fills this frame rather
        // than sizing to its contents: a palette that grows and shrinks as
        // results arrive moves the row you were aiming at out from under the
        // pointer.
        className="glass glass-dense lift-3 flex h-[36rem] max-h-full w-full max-w-[65rem] flex-col overflow-hidden rounded-[var(--radius-zone)]"
      >
        <div className="flex shrink-0 items-center gap-2.5 px-6 py-5">
          <SearchGlyph />
          {scope && (
            <ScopeChip
              scope={scope}
              hueOf={hueOf}
              subtags={subtags}
              hasChildren={scopeHasChildren}
              onToggleSubtags={() => setSubtags((on) => !on)}
              onDrop={dropScope}
            />
          )}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={
              scope
                ? `${scopePrompt(scope)}…`
                : "Search notes, tags and actions…"
            }
            aria-label={
              scope
                ? `${scopePrompt(scope)}. Backspace on an empty field ${
                    scope.kind === "tags"
                      ? "lists notes first"
                      : "searches every note"
                  }.`
                : "Search notes, tags and actions. Type a hashtag and a space to search one tag."
            }
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            // The rows are driven from this field rather than focused, so the
            // highlight has to be announced from here or a screen reader
            // follows the caret and hears nothing move.
            aria-activedescendant={active ? `palette-${active.id}` : undefined}
            // The global :focus-visible ring is clipped by this dialog's
            // rounded overflow and reads as a stray line across it. The
            // palette being open, with the caret in this field, is affordance
            // enough. That rule is unlayered, so it outranks any utility
            // regardless of specificity — hence the `!`.
            className="min-w-0 flex-1 bg-transparent py-1 text-base text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none!"
          />
          {/* Counted by kind, not totalled. "6 results" over four notes and
              two tags is a number you cannot check against the list, and the
              two are not interchangeable anyway — one opens a note, one opens
              an index. Actions stay uncounted: they are the palette's own
              furniture rather than something the collection answered with. */}
          {needle && (
            <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-ink-faint">
              {countLine(total, tagTotal)}
            </span>
          )}
        </div>

        {/* `minmax(0, …)` rather than a bare `fr`: a grid track's automatic
            minimum is its content's, so one unbreakable URL in a preview
            widens that column and squeezes the list beside it down to
            truncated stubs. The columns hold their ratio whatever lands in
            them. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          <div
            ref={listRef}
            id="palette-list"
            role="listbox"
            aria-label="Results"
            // The right inset is a margin, not padding, and that is the whole
            // of it: a scrollbar's gutter is taken off the *border* box, so
            // padding puts the bar outside the inset — hard against the seam
            // with the preview, reading as that panel's furniture rather than
            // this list's. A margin moves the border edge instead, and the bar
            // comes with it, landing beside the rows it measures. The two are
            // the same distance, so the rows keep the width they had.
            className="mr-3 min-h-0 overflow-y-auto pb-4 pl-3"
          >
            {emptyLine && (
              <p className="px-3 pb-1 pt-6 text-center text-[13px] text-ink-faint">
                {emptyLine}
              </p>
            )}
            {sections.map((section) => (
              <div
                key={section.heading}
                role="group"
                aria-label={section.heading}
              >
                <p className="px-3 pb-1 pt-4 text-[11px] uppercase tracking-wider text-ink-faint">
                  {section.heading}
                </p>
                {section.rows.map((row) => (
                  <PaletteRow
                    key={row.id}
                    row={row}
                    active={row.id === active?.id}
                    hueOf={hueOf}
                    onHover={() => setActiveId(row.id)}
                    onPick={() => choose(row)}
                  />
                ))}
              </div>
            ))}
          </div>

          <PalettePreview
            row={active}
            tags={tags}
            hueOf={hueOf}
            onNavigate={close}
          />
        </div>

        <div className="zone-step flex shrink-0 items-center justify-between gap-4 px-6 py-3 text-[12px] text-ink-faint">
          {/* A legend, not a status line: every key the palette has stays
              listed, and the ones that would do nothing right now are dimmed
              rather than removed. Swapping them in and out means you only ever
              learn a key exists after you've already stumbled onto the row
              that needs it, and it makes the strip jump as you arrow down. */}
          <span className="flex items-center gap-4">
            <Hint keys="↑↓" label="navigate" live />
            <Hint keys="⏎" label="open" live />
            <Hint keys="⇥" label="narrow" live={active?.kind === "tag"} />
            {/* Lit only when the key would actually do this. ⌫ drops the scope
                on an empty field and deletes a character otherwise, so a hint
                that stays lit while you are typing is telling you the wrong
                one of those roughly every time you read it. */}
            <Hint
              keys="⌫"
              label="clear scope"
              live={scope !== null && query === ""}
            />
          </span>
          <span className="truncate">esc close</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The chip above the field: what the search is pointed at, and the × that
 * takes it off.
 *
 * A tag wears its own colour, because that colour is how a tag is identified
 * everywhere else in this app and a chip that dropped it would be the one
 * place `#infra` isn't blue. The other two have no colour to wear — the whole
 * of Untagged is the notes no hue reaches — so they take the neutral pair the
 * rail already uses for exactly these rows: a `.rail-dot` ring rather than a
 * filled disc, on the flat `.row-selected` tint. Filling a grey disc would
 * read as a tag whose colour hadn't loaded yet; the ring reads as not-a-tag on
 * purpose, which is what both of them are.
 *
 * Only a tag can have sub-tags, so only a tag gets the `+ sub` switch. The ×
 * is on all three: it is the only visible sign the search can be widened.
 */
function ScopeChip({
  scope,
  hueOf,
  subtags,
  hasChildren,
  onToggleSubtags,
  onDrop,
}: {
  scope: PaletteScope;
  hueOf: (name: string) => number;
  subtags: boolean;
  hasChildren: boolean;
  onToggleSubtags: () => void;
  onDrop: () => void;
}) {
  const tag = scopeTag(scope);
  const label = scopeLabel(scope);

  return (
    <span
      style={tag ? ({ "--h": hueOf(tag) } as React.CSSProperties) : undefined}
      // Not .tag-pill: that class is for a tag drawn as bare text until it's
      // reached for, and this one is a standing statement about what the field
      // will search. It is filled at rest, in the same tint the rail's
      // selected row uses — the two are saying the same thing.
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full pl-2.5 pr-1 text-[13px] ${
        tag ? "hue-row-selected" : "row-selected"
      }`}
    >
      <span
        aria-hidden
        className={`size-[7px] shrink-0 rounded-full ${
          tag ? "hue-dot" : "rail-dot"
        }`}
      />
      <span className={`max-w-40 truncate ${tag ? "hue-text" : "text-ink"}`}>
        {label}
      </span>
      {/* The sub-tag rule, said once and said as a switch.
          It used to be `/*` here, a heading there and a sentence in
          the footer — three wordings of one fact, one of them glob
          syntax. Tone carries the state, the way it does everywhere
          else in this app: lit means the notes beneath are in. */}
      {hasChildren && (
        <button
          type="button"
          onClick={onToggleSubtags}
          aria-pressed={subtags}
          aria-label={
            subtags
              ? `Sub-tags of ${label} are included. Search ${label} only`
              : `Sub-tags of ${label} are excluded. Include them`
          }
          className={`shrink-0 rounded-full px-1.5 py-px text-[11px] transition-opacity focus-visible:outline-none! ${
            subtags
              ? "hue-text opacity-100"
              : "text-ink-faint opacity-55 hover:opacity-80"
          }`}
        >
          + sub
        </button>
      )}
      <button
        type="button"
        onClick={onDrop}
        // What dropping it does, which isn't the same sentence for a chip that
        // only orders the list: nothing is being widened there.
        aria-label={
          scope.kind === "tags"
            ? "List notes first instead of tags"
            : `Search every note instead of ${label}`
        }
        // Always visible, unlike the tag bar's remove control: this one is the
        // only sign that the search *can* be widened, and a control you have
        // to hover to discover is no better than the shortcut nobody found.
        className="grid size-4 place-items-center rounded-full text-ink-faint hover:text-ink focus-visible:text-ink focus-visible:outline-none!"
      >
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="size-[11px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M3.25 3.25 8.75 8.75M8.75 3.25 3.25 8.75" />
        </svg>
      </button>
    </span>
  );
}

/**
 * One key in the footer legend.
 *
 * `live` is tone, not presence — the same trick the rest of the app uses for
 * state, since there are no borders here to switch on and off. A key that
 * can't be pressed right now is still worth having read once.
 */
function Hint({
  keys,
  label,
  live,
}: {
  keys: string;
  label: string;
  live: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 transition-opacity duration-200 ${
        live ? "text-ink-muted" : "opacity-40"
      }`}
    >
      <span aria-hidden className="font-mono">
        {keys}
      </span>
      <span>{label}</span>
    </span>
  );
}

/**
 * One row.
 *
 * A div with `role="option"` and no key handling of its own: the caret never
 * leaves the field, so a row that could take focus would only ever take it
 * away from the thing being typed into. Arrow keys move `activeId`; this
 * renders whatever that lands on.
 */
function PaletteRow({
  row,
  active,
  hueOf,
  onHover,
  onPick,
}: {
  row: Row;
  active: boolean;
  hueOf: (name: string) => number;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <div
      id={`palette-${row.id}`}
      data-row-id={row.id}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onPick}
      className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] px-3 py-[7px] ${
        active ? "bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]" : ""
      }`}
    >
      {row.kind === "tag" && (
        <span
          aria-hidden
          style={{ "--h": hueOf(row.name) } as React.CSSProperties}
          className="hue-dot mt-[7px] size-[7px] shrink-0 rounded-full"
        />
      )}
      {row.kind === "action" && (
        <span className="mt-[3px] shrink-0 text-ink-faint">
          <ActionGlyph icon={row.action.icon} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-[14px] ${
              active ? "text-ink" : "text-ink-muted"
            }`}
          >
            <RowTitle row={row} hueOf={hueOf} />
          </span>
          {row.kind === "note" && (
            <RelativeDate
              date={row.note.updatedAt}
              className="shrink-0 whitespace-nowrap text-[12px] text-ink-faint"
            />
          )}
          {row.kind === "tag" && (
            <span className="shrink-0 whitespace-nowrap text-[12px] text-ink-faint">
              {row.count} {row.count === 1 ? "note" : "notes"}
            </span>
          )}
          {row.kind === "action" && row.action.shortcut && (
            <span className="shrink-0 font-mono text-[12px] text-ink-faint">
              {row.action.shortcut}
            </span>
          )}
        </div>
        {/* The reason line. Never conditional — a row with nothing here is a
            row that cannot say why the search returned it. */}
        <p className="truncate text-[12px] leading-snug text-ink-faint">
          <RowReason row={row} hueOf={hueOf} />
        </p>
      </div>

      {/* No `⇥ narrow` here. Landing on a tag row already says it twice — the
          footer's key lights up, and the preview names where each verb goes —
          and a third copy at the row's edge was the one that also had to fight
          the note count for the space. */}
    </div>
  );
}

function RowTitle({
  row,
  hueOf,
}: {
  row: Row;
  hueOf: (name: string) => number;
}) {
  if (row.kind === "action") return <>{row.action.label}</>;
  if (row.kind === "tag") {
    return (
      <span
        style={{ "--h": hueOf(row.name) } as React.CSSProperties}
        className="hue-text"
      >
        #{row.name}
      </span>
    );
  }
  return (
    <Highlighted
      spans={highlight(row.note.title || "Untitled", row.note.terms)}
    />
  );
}

/** What put this row in the list, in the row's own words. */
function RowReason({
  row,
  hueOf,
}: {
  row: Row;
  hueOf: (name: string) => number;
}) {
  if (row.kind === "action") return <>{row.action.detail}</>;
  if (row.kind === "tag") return <>Tag index</>;

  const { note } = row;
  if (note.reason.kind === "tag") {
    // The one case where the note's own text explains nothing, so the row has
    // to name the tag that did the work — under a `#vercel` scope, learning it
    // was `#vercel/test` that matched is the whole of why this row is here.
    return (
      <>
        matched tag{" "}
        <span
          style={{ "--h": hueOf(note.reason.tag) } as React.CSSProperties}
          className="hue-text"
        >
          #{note.reason.tag}
        </span>{" "}
        · no body match
      </>
    );
  }

  const { spans, source } = snippet(note.text, note.raw, note.terms);
  if (source !== "none") return <Highlighted spans={spans} />;

  // Nothing in the body to point at. If the title carried the match, this row
  // has already shown it — highlighted, one line up — so the opening prose is
  // context rather than a claim, and saying "not in the text" under a title
  // with the word lit up in it would be the confusing one.
  if (countMatches(note.title, note.terms) > 0) {
    return <Highlighted spans={excerpt(note.text, [])} />;
  }

  // Otherwise the index matched a term the visible note never spells — a fuzzy
  // hit on `vecel`, or a word that lives somewhere even the raw body doesn't
  // reach. An opening line with nothing marked in it is exactly what reads as
  // a result that shouldn't be here, so the row names the term instead.
  return (
    <>
      matched{" "}
      {note.terms
        .slice(0, 2)
        .map((term) => `“${term}”`)
        .join(", ")}{" "}
      · not in the note&apos;s text
    </>
  );
}

/**
 * What the search found, by kind: `4 notes · 2 tags`.
 *
 * Notes are always counted, zero included, because a query is a question about
 * notes first and `0 notes · 2 tags` is the answer to it — dropping the half
 * that says nothing was found would leave the header quietly reporting a
 * success. Tags drop out at zero: they are the second answer, and a standing
 * `· 0 tags` on every search is a column of nothing.
 *
 * Notes stay first here even where the list puts the tags on top. This counts
 * what the collection answered with; the order of the sections is a separate
 * fact about how it's laid out, and swapping the halves to match would make
 * the same search report itself two ways.
 */
function countLine(notes: number, tags: number): string {
  const noteLine = `${notes} note${notes === 1 ? "" : "s"}`;
  return tags > 0
    ? `${noteLine} · ${tags} tag${tags === 1 ? "" : "s"}`
    : noteLine;
}

function commandMatches(
  label: string,
  keywords: string | undefined,
  needle: string,
): boolean {
  return (
    label.toLowerCase().includes(needle) ||
    (keywords?.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * "New note", carrying whatever the palette knows about the note you'd make:
 * the words you typed become its title, the scope becomes its tag.
 */
function newNote(
  router: ReturnType<typeof useRouter>,
  title: string,
  scope: string | null,
): PaletteAction {
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  if (scope) params.set("tag", scope);
  const detail =
    [title && `titled “${title}”`, scope && `tagged #${scope}`]
      .filter(Boolean)
      .join(" · ") || "Blank, and filed nowhere yet";

  return {
    id: "new-note",
    label: "New note",
    detail,
    icon: "note",
    run: () =>
      router.push(params.size > 0 ? `/notes/new?${params}` : "/notes/new"),
  };
}

function SearchGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className="size-[18px] shrink-0 text-ink-faint"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ActionGlyph({ icon }: { icon: ActionIcon }) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-[15px]",
  };

  if (icon === "note") {
    return (
      <svg {...common}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9z" />
        <path d="M12 11v6M9 14h6" />
      </svg>
    );
  }
  if (icon === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }
  if (icon === "tag") {
    return (
      <svg {...common}>
        <path d="M4 12.5V5a1 1 0 0 1 1-1h7.5a1 1 0 0 1 .7.3l7 7a1 1 0 0 1 0 1.4l-6.5 6.5a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1-.3-.7z" />
        <circle cx="8.5" cy="8.5" r="1.2" />
      </svg>
    );
  }
  if (icon === "image") {
    // The rail's Images row, at this size: one frame, one sun, one hill.
    return (
      <svg {...common}>
        <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="m3.5 17 4.6-4.4a2 2 0 0 1 2.8 0L16.5 18" />
      </svg>
    );
  }
  if (icon === "upload") {
    // An arrow going *into* a tray: the file is coming in from outside, which
    // is the one thing this row does that "New note" doesn't.
    return (
      <svg {...common}>
        <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
        <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
