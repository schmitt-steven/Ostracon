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
import { requestLogout } from "@/lib/auth/logout-request";
import {
  applyPreference,
  resolvePreference,
  subscribeToTheme,
} from "@/lib/theme";
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

/** How many notes a search shows — tuned to the fixed-height list column. */
const NOTE_LIMIT = 10;
/** How many notes the query-less list shows. */
const RECENT_LIMIT = 5;
/** How many tags the Tags section offers before it is cut. */
const TAG_LIMIT = 5;
/** And how many when the tags lead (tag-directory scope) — a few less than
 * fills the column, so a note row or two still shows. */
const TAG_LEAD_LIMIT = 6;
const DEBOUNCE_MS = 80;

// What the Recent section says before there's anything recent, so an empty
// column doesn't read as a failed load.
const RECENT_EMPTY =
  "Notes you open will show up here — make your first one below.";

/**
 * ⌘K: jump to a note or tag, and act on the note you're on (new note, suggest
 * tags, switch mode). Account actions (theme, log out) have no resting row —
 * they're in the rail — but land here once their name is typed.
 *
 * Rules that hold the layout together:
 * - The frame never moves — two columns in every state, results or not.
 * - Sections are in a fixed order (Notes, Tags, Actions with a query; Recent,
 *   Actions without); nothing re-sorts across them. The tag-directory chip
 *   swaps the first two and says so on screen.
 * - Every row says why it's there — a tag-only match says as much (computed in
 *   lib/search/results, which also orders the rows).
 * - Each fact has one home: the scope lives on the chip, headings name a kind,
 *   the footer lists keys, the count is `4 notes · 2 tags`.
 *
 * ⇥ or typing `#infra ` narrows to a tag; a `#` before anything else is just
 * stripped before matching.
 */
export function CommandPalette({ tags, open, onOpenChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  // What the list is built from — trails `query` by one debounce.
  const [deferred, setDeferred] = useState("");
  // The highlighted row, stamped with the list it was chosen in — a stale
  // stamp resolves to the first row of the new list. Derived, not reset in an
  // effect (which would render the stale highlight for a frame).
  const [mark, setMark] = useState<{ list: string; id: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { hueOf } = useTagHues();

  // The corpus fetch is deferred until the palette is first opened, latched in
  // the store so opening doesn't round-trip through an effect.
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

  // Which palette is drawn now, for the "Switch theme" row's wording — read
  // off the same store the settings switch uses.
  const darkTheme = useSyncExternalStore(
    subscribeToTheme,
    () => resolvePreference() === "dark",
    () => false,
  );

  // What the route is looking at (see [scopeFromPath]).
  const routeScope = scopeFromPath(pathname);

  // What this opening did to the scope: `undefined` = untouched (falls back to
  // the route), `null` = dropped, a scope = picked. Three states so "dropped"
  // survives a re-render.
  const [override, setOverride] = useState<PaletteScope | null | undefined>(
    undefined,
  );
  const scope = override === undefined ? routeScope : override;

  // The tag-directory scope — the odd one, not a filter: tags lead, every note
  // still follows below them.
  const tagsFirst = scope?.kind === "tags";

  // Whether the scope gathers anything beneath it — the `+ sub` toggle only
  // appears then. Tags only; the others have no tree.
  const scopeHasChildren =
    scope?.kind === "tag" &&
    tags.some((name) => name !== scope.name && tagMatches(name, scope.name));

  // Whether the scope sweeps in sub-tags. Sticky across scope changes within
  // one opening; `close()` resets it.
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

  // Point the search at a tag and stay open; clear the field, since finding
  // the tag was what it was for.
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

  // Whether a name is a searchable tag. `tagCounts` carries ancestors but is
  // empty until the corpus lands, so `tags` covers the first moment.
  const isTag = useCallback(
    (name: string) =>
      tagCounts.has(name) ||
      tags.some((tag) => tag === name || tagMatches(tag, name)),
    [tagCounts, tags],
  );

  // `#vercel ` narrows to that tag (as it does in a note body). The `#` and
  // the exact name are both required — a bare word or a prefix could silently
  // become a filter you can't undo.
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

  // A leading `#` is accepted and ignored.
  const needle = deferred.trim().replace(/^#+/, "").trim().toLowerCase();

  // Identity of the current list. `query` is deliberately not in it, so the
  // highlight survives keystrokes inside a debounce.
  const listKey = `${needle} ${scope ?? ""} ${subtags}`;
  const activeId = mark?.list === listKey ? mark.id : null;
  const setActiveId = useCallback(
    (id: string) => setMark({ list: listKey, id }),
    [listKey],
  );

  // `total` is what the header reports; `hits` is the slice that fits.
  const { hits: noteHits, total } = useMemo<{
    hits: NoteHit[];
    total: number;
  }>(() => {
    if (needle) return search(needle, scope, NOTE_LIMIT, subtags);
    const hits = recent(RECENT_LIMIT, scope, subtags);
    return { hits, total: hits.length };
  }, [needle, scope, subtags, search, recent]);

  // The tags the query matches: the list shows the first few, the header the
  // total. Independent of the notes. Under tags-first it's the leading section
  // and stands without a query (recency order, like /tags itself).
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
    // Recency sort only where the tags lead; otherwise keep arrival order.
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

  // What this query would find without the scope — only asked when the scoped
  // search came back empty. Limit 0; only the count is wanted.
  const wideTotal = useMemo(() => {
    if (!needle || !scope) return 0;
    // Nothing to widen to under the directory's chip — it doesn't narrow.
    if (tagsFirst || noteHits.length > 0) return 0;
    return search(needle, null, 0).total;
  }, [needle, scope, tagsFirst, noteHits.length, search]);

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];

    // Notes from outside — sits beside "New note"; the detail names the drag
    // gesture that does the same.
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
        // "markdown" lives here since the label no longer says it.
        "upload import markdown md txt text file drag drop",
        needle,
      );

    // Theme and log out — gated on `needle` with no fallback; their home is
    // the rail.
    const switchTheme: PaletteAction = {
      id: "theme",
      label: darkTheme ? "Switch to light theme" : "Switch to dark theme",
      detail: darkTheme
        ? "Draw the app in the light palette"
        : "Draw the app in the dark palette",
      icon: "theme",
      run: () => applyPreference(darkTheme ? "light" : "dark"),
    };
    const themeMatches =
      !!needle &&
      commandMatches(
        switchTheme.label,
        // Combos spelled out — matching is substring, not per-token.
        "theme mode dark light dark mode light mode appearance color colour scheme",
        needle,
      );

    const logOut: PaletteAction = {
      id: "log-out",
      label: "Log out",
      detail: "End this session and return to the sign-in screen",
      icon: "run",
      run: requestLogout,
    };
    const logOutMatches =
      !!needle &&
      commandMatches(
        logOut.label,
        "log out logout sign out signout quit exit end session",
        needle,
      );

    // Nothing found: the ways out, most-likely first. Typing a command's name
    // counts as finding it. Under tags-first, matched tags count as found.
    const foundNothing =
      noteHits.length === 0 && (!tagsFirst || tagRows.length === 0);
    if (needle && foundNothing) {
      if (importMatches) list.push(importFiles);
      if (themeMatches) list.push(switchTheme);
      if (logOutMatches) list.push(logOut);
      list.push(newNote(router, needle, scopeTag(scope)));
      return list;
    }

    // The two ways to make a note, paired.
    list.push(newNote(router, needle, scopeTag(scope)));
    if (importMatches) list.push(importFiles);

    // The current view's own commands, before the navigations.
    for (const command of contextual) {
      if (needle && !commandMatches(command.label, command.keywords, needle)) {
        continue;
      }
      list.push({
        id: `cmd:${command.id}`,
        label: command.label,
        // Falls back to the group name.
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

    // The only way to browse tags now that the rail lists none.
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

    // Last — reached for least often.
    if (themeMatches) list.push(switchTheme);
    if (logOutMatches) list.push(logOut);

    return list;
  }, [
    needle,
    tagsFirst,
    tagRows.length,
    noteHits.length,
    scope,
    contextual,
    darkTheme,
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

    // The scoped miss as a row: "0 in #vercel · 4 in all notes", first in the
    // list where the highlight lands, so Return widens. Not under Actions —
    // this changes what the field points at, like the chip.
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
                    // `scope` is non-null wherever this row exists.
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

    // Headings name a kind, never the scope (the chip states that). Under
    // tags-first, tags go on top; notes keep their usual section below.
    if (tagsFirst) {
      return [
        ...tagSection,
        {
          heading: needle ? "Notes" : "Recent",
          rows: noteRows,
          empty: needle ? undefined : RECENT_EMPTY,
        },
        actionSection,
      ];
    }

    // No query: Recent first, then the verbs.
    if (!needle) {
      return [
        { heading: "Recent", rows: noteRows, empty: RECENT_EMPTY },
        actionSection,
      ];
    }

    // No note matched: Notes gives way to the widen row (or the empty
    // sentence); Tags still show.
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

  // Stored as row identity, resolved to an index each render, so a keystroke
  // re-ranking the list keeps the highlight on the same row.
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
      // `/` opens the palette (it used to focus the rail's tag filter).
      // Ignored while typing or with a modifier, so it can't steal a slash.
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

  // Refocus the field after a scope change (the × and tag rows are
  // mouse-reachable). In an effect so the ref is only touched there.
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
    // A scoped search is an index too — a note opens under the scope's tag.
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
      // Only swallowed over a tag row; elsewhere it still moves focus.
      if (active?.kind !== "tag") return;
      event.preventDefault();
      narrowTo(active.name);
    } else if (event.key === "Backspace") {
      // Only reaches the chip when the field is genuinely empty.
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

  // The sentence over the list, only when no row (widen, tags) can explain the
  // miss. Names the scope only where the scope ruled something out.
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
        // Fixed size — every state fills this frame, so results arriving don't
        // move the row under the pointer.
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
            // The rows are driven from this field, so the highlight has to be
            // announced here for a screen reader.
            aria-activedescendant={active ? `palette-${active.id}` : undefined}
            // The global :focus-visible ring is clipped by the dialog's radius
            // into a stray line; the open palette is affordance enough. `!`
            // beats the unlayered rule.
            className="min-w-0 flex-1 bg-transparent py-1 text-base text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none!"
          />
          {/* Counted by kind, not totalled — a note and a tag aren't
              interchangeable. Actions are uncounted. */}
          {needle && (
            <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-ink-faint">
              {countLine(total, tagTotal)}
            </span>
          )}
        </div>

        {/* `minmax(0, …)`, not a bare `fr`, so an unbreakable URL in a preview
            can't widen its column and squeeze the list. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          <div
            ref={listRef}
            id="palette-list"
            role="listbox"
            aria-label="Results"
            // A margin, not padding, so the scrollbar gutter comes with the
            // border edge and the bar lands beside the rows, not on the seam.
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
                {section.rows.length === 0 && section.empty && (
                  <p className="px-3 pb-1 pt-1 text-[13px] text-ink-faint">
                    {section.empty}
                  </p>
                )}
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
          {/* A legend — every key stays listed, dimmed when it would do
              nothing, so the strip doesn't jump as you arrow down. */}
          <span className="flex items-center gap-4">
            <Hint keys="↑↓" label="navigate" live />
            <Hint keys="⏎" label="open" live />
            <Hint keys="⇥" label="narrow" live={active?.kind === "tag"} />
            {/* Lit only when ⌫ would drop the scope (empty field), not delete. */}
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
 * drops it. A tag wears its hue; Untagged/All tags take the rail's neutral
 * `.rail-dot` ring on `.row-selected`. Only a tag gets the `+ sub` switch; the
 * × is on all three.
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
      // Not .tag-pill — this is filled at rest, in the rail's selected tint.
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
      {/* The sub-tag rule, said once, as a switch — lit means sub-tags are in. */}
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
        // The `tags` chip only reorders, so it gets a different label.
        aria-label={
          scope.kind === "tags"
            ? "List notes first instead of tags"
            : `Search every note instead of ${label}`
        }
        // Always visible — the only sign the search can be widened.
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

/** One key in the footer legend. `live` dims rather than removes. */
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

/** One row — a `role="option"` div with no focus or key handling; the caret
 * stays in the field, arrow keys move `activeId`. */
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
        {/* The reason line — never conditional; every row says why it's here. */}
        <p className="truncate text-[12px] leading-snug text-ink-faint">
          <RowReason row={row} hueOf={hueOf} />
        </p>
      </div>

      {/* No `⇥ narrow` at the row edge — the footer key and the preview say it. */}
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
    // The note's text explains nothing here, so name the tag that matched.
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

  // Nothing in the body — but if the title carried the match (shown one line
  // up), the opening prose is just context.
  if (countMatches(note.title, note.terms) > 0) {
    return <Highlighted spans={excerpt(note.text, [])} />;
  }

  // Otherwise the index matched a term the visible note never spells (a fuzzy
  // hit, or a word only in stripped markup) — name the term instead.
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
 * What the search found, by kind: `4 notes · 2 tags`. Notes always counted
 * (zero included); tags drop out at zero. Notes first regardless of section
 * order — this counts what was found, not how it's laid out.
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

/** "New note", carrying what the palette knows: the query becomes the title,
 * the scope its tag. */
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
  if (icon === "theme") {
    // A disc half filled: the contrast mark this control carries everywhere,
    // standing for the light/dark pair it flips between.
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
