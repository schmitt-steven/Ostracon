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
import { excerpt, highlight } from "@/lib/search/highlight";
import { tagMatches } from "@/lib/tags/parse";
import {
  ALL_NOTES_HREF,
  tagFromSegments,
  tagHref,
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
const NOTE_LIMIT = 8;
/** How many notes the query-less list shows. */
const RECENT_LIMIT = 8;
/** How many tags the Tags section offers before it is cut. */
const TAG_LIMIT = 4;
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
 * Actions, Recent without one. Nothing re-sorts on relevance across sections,
 * so the row your hand is reaching for is where it was last time.
 *
 * **Every row says why it is there.** A title that visibly doesn't contain
 * what you typed, sitting in a list with no explanation, reads as the search
 * being broken — so a tag-only match says so in as many words. The reason is
 * computed in the search layer (lib/search/results) because it decides the
 * row's order as well as its wording.
 *
 * One verb on top of "open": ⇥ narrows the search to the highlighted tag. A
 * leading `#` is stripped before matching rather than switching the list into
 * a mode of its own — `#infra` and `infra` find the same things, and both
 * verbs are on the row either way.
 */
export function CommandPalette({ tags, open, onOpenChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  // What the list is actually built from. Trails `query` by one debounce so a
  // fast typist rebuilds the sections once instead of once per keystroke.
  const [deferred, setDeferred] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
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
  const { search, recent, tagCounts } = useSearchIndex(everOpened);

  const contextual = useSyncExternalStore(
    subscribeContextualCommands,
    getContextualCommands,
    getServerContextualCommands,
  );

  // Which tag the current route is showing, read from the pathname exactly as
  // the rail reads it. Threading it down from the page instead would mean
  // every route remembering to tell a component mounted above the router.
  const routeTag = pathname.startsWith("/t/")
    ? tagFromSegments(pathname.slice(3).split("/"))
    : null;

  // What this opening did to the scope: `undefined` is "hasn't touched it",
  // `null` is "dropped it", a name is "picked that one". Three states rather
  // than two because the resting scope is the route's tag — searching from
  // inside `#infra` almost always means searching `#infra` — and "dropped"
  // has to be tellable from "not yet decided", or widening the search would
  // last exactly one render before the route seeded it again.
  const [override, setOverride] = useState<string | null | undefined>(
    undefined,
  );
  const scope = override === undefined ? routeTag : override;

  // Whether the scope actually gathers anything beneath it. The chip says
  // `#vercel/*` rather than `#vercel` only when there is a `#vercel/…` to
  // include, so the `/*` is a fact about this collection rather than
  // decoration.
  const scopeHasChildren =
    scope !== null &&
    tags.some((name) => name !== scope && tagMatches(name, scope));

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setDeferred("");
    setActiveId(null);
    setOverride(undefined);
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
    setOverride(name);
    setQuery("");
    setDeferred("");
    setActiveId(null);
  }, []);

  const dropScope = useCallback(() => {
    setOverride(null);
    setActiveId(null);
  }, []);

  // A leading `#` is how tags are written everywhere else in the app, so it is
  // accepted and ignored rather than made to mean something extra.
  const needle = deferred.trim().replace(/^#+/, "").trim().toLowerCase();

  // `total` is what the header reports; `hits` is the slice that fits. With no
  // query the two are the same thing and the header shows neither.
  const { hits: noteHits, total } = useMemo<{
    hits: NoteHit[];
    total: number;
  }>(() => {
    if (needle) return search(needle, scope, NOTE_LIMIT);
    const hits = recent(RECENT_LIMIT, scope);
    return { hits, total: hits.length };
  }, [needle, scope, search, recent]);

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];
    const widen: PaletteAction | null = scope
      ? {
          id: "widen",
          label: "Search all notes instead",
          detail: `Drops #${scope} and searches the whole collection`,
          icon: "search",
          shortcut: "⌫",
          keepOpen: true,
          run: dropScope,
        }
      : null;

    // Nothing found: the two ways out, in the order you would reach for them.
    if (needle && noteHits.length === 0) {
      if (widen) list.push(widen);
      list.push(newNote(router, needle, scope));
      return list;
    }

    if (needle) {
      list.push(newNote(router, needle, scope));
    } else {
      list.push(newNote(router, "", scope), {
        id: "all-notes",
        label: "Go to all notes",
        detail: "Every note, newest first",
        icon: "run",
        run: () => router.push(ALL_NOTES_HREF),
      });
    }

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
        icon: "run",
        shortcut: command.shortcut,
        run: command.run,
      });
    }

    if (!needle || commandMatches("Go to untagged notes", "orphan none", needle)) {
      list.push({
        id: "untagged",
        label: "Go to untagged notes",
        detail: "Notes that were never filed",
        icon: "tag",
        run: () => router.push(UNTAGGED_HREF),
      });
    }

    if (widen) list.push(widen);
    return list;
  }, [needle, noteHits.length, scope, contextual, router, dropScope]);

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

    // No query: the verbs first, then what you last touched. The highlight
    // lands on "New note" rather than on a note you might not have meant to
    // open with a stray Return.
    if (!needle) {
      return [
        actionSection,
        {
          heading: scope ? `Recent in #${scope}` : "Recent",
          rows: noteRows,
        },
      ];
    }

    // Nothing matched: the frame stays, the Notes section is replaced by the
    // sentence rendered above the list, and Tags is dropped — offering a tag
    // to narrow *further* into a search that already found nothing is the one
    // suggestion that cannot help.
    if (noteRows.length === 0) return [actionSection];

    const tagRows: Row[] = tags
      .filter((name) => name !== scope && name.toLowerCase().includes(needle))
      .slice(0, TAG_LIMIT)
      .map((name) => ({
        id: `tag:${name}`,
        kind: "tag",
        name,
        count: tagCounts.get(name) ?? 0,
      }));

    return [
      { heading: scope ? `Notes in #${scope}` : "Notes", rows: noteRows },
      ...(tagRows.length > 0 ? [{ heading: "Tags", rows: tagRows }] : []),
      actionSection,
    ];
  }, [needle, scope, noteHits, actions, tags, tagCounts]);

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
      ?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(activeId ?? "")}"]`)
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
    if (row.kind === "note") router.push(`/notes/${row.note.slug}`);
    else router.push(tagHref(row.name));
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
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

  const emptyLine =
    needle && noteHits.length === 0
      ? `No notes match “${deferred.trim()}”${scope ? ` in #${scope}` : ""}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-shade/40 p-4 sm:p-6"
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
        className="flex h-[36rem] max-h-full w-full max-w-[65rem] flex-col overflow-hidden rounded-[var(--radius-zone)] bg-surface shadow-2xl shadow-shade/30"
      >
        <div className="flex shrink-0 items-center gap-2.5 px-6 py-5">
          <SearchGlyph />
          {scope && (
            <span
              style={{ "--h": hueOf(scope) } as React.CSSProperties}
              // Not .tag-pill: that class is for a tag drawn as bare text
              // until it's reached for, and this one is a standing statement
              // about what the field will search. It is filled at rest, in
              // the same tint the rail's selected row uses — the two are
              // saying the same thing.
              className="hue-row-selected flex h-7 shrink-0 items-center gap-1.5 rounded-full pl-2.5 pr-1 text-[13px]"
            >
              <span aria-hidden className="hue-dot size-[7px] rounded-full" />
              <span className="hue-text max-w-40 truncate">
                {/* `/*` only when there is something beneath to sweep in. */}
                #{scope}
                {scopeHasChildren && "/*"}
              </span>
              <button
                type="button"
                onClick={dropScope}
                aria-label={`Search every note instead of #${scope}`}
                // Always visible, unlike the tag bar's remove control: this
                // one is the only sign that the search *can* be widened, and
                // a control you have to hover to discover is no better than
                // the shortcut nobody found.
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
          )}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={
              scope ? `Search #${scope}…` : "Search notes, tags and actions…"
            }
            aria-label={
              scope
                ? `Search #${scope}. Backspace on an empty field searches every note.`
                : "Search notes, tags and actions"
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
          {/* One count, one place. Notes only: the Tags and Actions rows are
              the palette's own furniture, and counting them would make the
              number disagree with what "results" means everywhere else. */}
          {needle && (
            <span className="shrink-0 text-[13px] tabular-nums text-ink-faint">
              {total} result{total === 1 ? "" : "s"}
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
            className="min-h-0 overflow-y-auto px-3 pb-4"
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

          <PalettePreview row={active} tags={tags} hueOf={hueOf} />
        </div>

        <div className="palette-zone flex shrink-0 items-center justify-between gap-4 px-6 py-3 text-[12px] text-ink-faint">
          {/* A legend, not a status line: every key the palette has stays
              listed, and the ones that would do nothing right now are dimmed
              rather than removed. Swapping them in and out means you only ever
              learn a key exists after you've already stumbled onto the row
              that needs it, and it makes the strip jump as you arrow down. */}
          <span className="flex items-center gap-4">
            <Hint keys="↑↓" label="navigate" live />
            <Hint keys="⏎" label="open" live />
            <Hint keys="⇥" label="narrow" live={active?.kind === "tag"} />
            <Hint keys="⌫" label="clear scope" live={scope !== null} />
          </span>
          {/* The one place the sub-tag rule is written out. The chip's `/*`
              is the same fact in shorthand; saying it twice in prose would
              make it look like two different rules. */}
          <span className="truncate">
            {scope && scopeHasChildren ? "includes sub-tags" : "esc close"}
          </span>
        </div>
      </div>
    </div>
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
  return <Highlighted spans={excerpt(note.text, note.terms)} />;
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
      router.push(
        params.size > 0 ? `/notes/new?${params}` : "/notes/new",
      ),
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
  return (
    <svg {...common}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
