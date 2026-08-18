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
import { useSearchIndex } from "@/hooks/use-search-index";
import { useTagHues } from "@/hooks/use-tag-hues";
import { logoutAction } from "@/lib/auth/actions";
import {
  getContextualCommands,
  getServerContextualCommands,
  subscribeContextualCommands,
  type Command,
} from "@/lib/command/registry";
import {
  getPaletteEverOpened,
  getServerPaletteEverOpened,
  subscribePaletteOpen,
} from "@/lib/command/palette-state";
import { applyTheme, currentTheme } from "@/lib/theme";
import { tagMatches } from "@/lib/tags/parse";
import { tagFromSegments, tagHref, UNTAGGED_HREF } from "@/lib/tags/routes";

type Props = {
  /** Every tag in use, for "jump to tag" and for the scope picker. */
  tags: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Row =
  | { kind: "command"; command: Command }
  | { kind: "note"; slug: string; title: string; tags: string[] }
  | { kind: "tag"; name: string }
  /** A tag offered as a *scope* rather than as a destination. */
  | { kind: "scope"; name: string };

/** How many notes the palette shows at once. */
const NOTE_LIMIT = 6;

/**
 * A `#…` token at the caret, which is what turns the palette into a scope
 * picker. Anchored to the end of the query because it describes what is
 * being typed right now — a `#foo` already followed by other words is
 * finished, and reopening the picker over it would fight the typist.
 */
const HASH_TOKEN = /(^|\s)#([^\s#]*)$/;

/** Which section of the list a row belongs under. */
function groupOf(row: Row): string {
  switch (row.kind) {
    case "command":
      return row.command.group;
    case "scope":
      return "Narrow to";
    case "tag":
      return "Tags";
    case "note":
      return "Notes";
  }
}

/**
 * ⌘K owns everything that isn't in the header.
 *
 * That's the trade the design makes: the header carries the two or three
 * things you use while looking at the thing itself, and every other verb —
 * jumping, suggesting tags, switching mode, changing theme — lives here rather
 * than as a button somewhere. Persistent chrome is what the old interface had
 * too much of; a palette costs nothing until it's asked for.
 *
 * It is also the *only* note search in the app. It used to be one of three —
 * a tag filter in the rail, a scoped field on each index, and this — which
 * meant the answer to "where do I search?" depended on where you happened to
 * be standing. The scope chip is what let the other two go: opening ⌘K from
 * `#infra` starts scoped to `#infra`, so the narrow search is still one
 * keystroke away, and ⌫ on an empty query widens it to everything.
 */
export function CommandPalette({ tags, open, onOpenChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
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
  const { search } = useSearchIndex(everOpened);

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
  //
  // Derived from the pathname rather than copied into state on open: as state
  // it needs an effect to stay in step with the URL, and clearing the override
  // on close is the same reset with none of the ordering.
  const [override, setOverride] = useState<string | null | undefined>(
    undefined,
  );
  const scope = override === undefined ? routeTag : override;

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setActive(0);
    setOverride(undefined);
  }, [onOpenChange]);

  const globalCommands = useMemo<Command[]>(
    () => [
      {
        id: "new-note",
        label: "New note",
        group: "Notes",
        keywords: "create write add",
        run: () => router.push("/notes/new"),
      },
      {
        id: "untagged",
        label: "Go to untagged notes",
        group: "Notes",
        keywords: "orphan none",
        run: () => router.push(UNTAGGED_HREF),
      },
      {
        id: "theme",
        label: "Toggle theme",
        group: "Settings",
        keywords: "dark light appearance",
        run: () => applyTheme(currentTheme() === "dark" ? "light" : "dark"),
      },
      {
        id: "logout",
        label: "Log out",
        group: "Settings",
        // The server action clears the session cookie and redirects; calling
        // it directly is the same request the rail's form makes.
        run: () => void logoutAction(),
      },
    ],
    [router],
  );

  const hashMatch = HASH_TOKEN.exec(query);
  const hashToken = hashMatch?.[2] ?? null;
  // Where the `#` itself sits, so picking a scope can cut the token back out
  // of the query rather than leaving it there to also be searched for.
  const hashStart = hashMatch
    ? hashMatch.index + (hashMatch[1]?.length ?? 0)
    : -1;

  const rows = useMemo<Row[]>(() => {
    // A `#` at the caret means "change what this is searching", so the list
    // becomes tags and nothing else. Mixing notes in would put two different
    // meanings of Enter one arrow key apart.
    if (hashToken !== null) {
      const needle = hashToken.toLowerCase();
      return tags
        .filter((tag) => tag !== scope && tag.includes(needle))
        .slice(0, 8)
        .map((name) => ({ kind: "scope", name }) as const);
    }

    const needle = query.trim().toLowerCase();
    const commands = [...contextual, ...globalCommands].filter(
      (command) =>
        !needle ||
        command.label.toLowerCase().includes(needle) ||
        command.keywords?.toLowerCase().includes(needle),
    );

    const tagRows: Row[] = (
      needle
        ? tags.filter((tag) => tag.includes(needle))
        : // Nothing typed: the palette is a menu of verbs, not a tag list.
          []
    )
      .slice(0, 5)
      .map((name) => ({ kind: "tag", name }));

    // Scoped, the index is asked for far more than fits and then narrowed
    // here: the top six notes overall may contain none of the scope's, and a
    // scoped search that came back empty while matches existed would be the
    // palette lying about the collection.
    const noteRows: Row[] = needle
      ? search(needle, scope ? Number.MAX_SAFE_INTEGER : NOTE_LIMIT)
          .filter(
            (hit) => !scope || hit.tags.some((name) => tagMatches(name, scope)),
          )
          .slice(0, NOTE_LIMIT)
          .map((hit) => ({
            kind: "note",
            slug: hit.slug,
            title: hit.title,
            tags: hit.tags,
          }))
      : [];

    return [
      ...commands.map((command) => ({ kind: "command", command }) as const),
      ...tagRows,
      ...noteRows,
    ];
  }, [query, hashToken, scope, contextual, globalCommands, tags, search]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }
      // `/` used to put the caret in the rail's tag filter. That field is
      // gone and this is where its job went, so the key follows it rather
      // than becoming one that does nothing. Ignored while typing into
      // anything, and while a modifier is down, so it can't steal a slash
      // mid-sentence.
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

  // Keeps the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function dropScope() {
    setOverride(null);
    setActive(0);
    inputRef.current?.focus();
  }

  function choose(row: Row) {
    if (row.kind === "scope") {
      // Stays open: picking a scope is the setup for the search, not the
      // search. The token comes back out of the query so it isn't then also
      // matched against titles.
      setOverride(row.name);
      setQuery(query.slice(0, hashStart).trimEnd());
      setActive(0);
      inputRef.current?.focus();
      return;
    }
    close();
    if (row.kind === "command") row.command.run();
    else if (row.kind === "note") router.push(`/notes/${row.slug}`);
    else router.push(tagHref(row.name));
  }

  function onInputKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActive((i) => (rows.length === 0 ? 0 : (i + 1) % rows.length));
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((i) =>
        rows.length === 0 ? 0 : (i - 1 + rows.length) % rows.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row) choose(row);
    } else if (event.key === "Backspace" && query === "" && scope) {
      // Backspace over the chip widens the search rather than doing nothing —
      // the same gesture that removes the last token in any tag field.
      event.preventDefault();
      dropScope();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return (
    <div
      // Centred on both axes. The dialog is capped at the padded height
      // below, so a short viewport shrinks the list rather than pushing the
      // input off the top — the failure mode centring invites.
      className="fixed inset-0 z-50 flex items-center justify-center bg-shade/40 p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-zone)] bg-surface shadow-2xl shadow-shade/30"
      >
        <div className="flex items-center gap-2 px-4 py-3">
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
              <span className="hue-text max-w-40 truncate">#{scope}</span>
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
            onChange={(event) => {
              setQuery(event.target.value);
              // Back to the top on every keystroke. Leaving the highlight
              // where it was would mean the selected row silently changes
              // meaning under the typist's fingers.
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={
              scope
                ? `Search #${scope} or press ⌫ to search all notes`
                : "Search notes, tags and commands…"
            }
            aria-label={
              scope
                ? `Search #${scope}. Backspace on an empty field searches every note.`
                : "Search notes, tags and commands"
            }
            spellCheck={false}
            // The global :focus-visible ring is clipped by this dialog's
            // rounded overflow and reads as a stray line across it. The
            // palette being open, with the caret in this field, is affordance
            // enough. That rule is unlayered, so it outranks any utility
            // regardless of specificity — hence the `!`.
            className="min-w-0 flex-1 bg-transparent px-1 py-1 text-base text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none!"
          />
        </div>
        <ul ref={listRef} className="min-h-0 max-h-80 overflow-y-auto px-2 pb-2">
          {rows.length === 0 && (
            <li className="px-3 py-6 text-center text-[13px] text-ink-faint">
              {hashToken !== null
                ? "No tag matches."
                : scope
                  ? `Nothing in #${scope} matches. Press ⌫ on an empty field to search every note.`
                  : "Nothing matches."}
            </li>
          )}
          {rows.map((row, index) => {
            // A heading on the first row of each run. Read off the previous
            // row rather than carried in a variable across the map: the rows
            // are already grouped in the order they were built, so the
            // neighbour is the whole answer.
            const group = groupOf(row);
            const previous = rows[index - 1];
            const heading =
              !previous || groupOf(previous) !== group ? group : null;

            return (
              <li key={`${row.kind}-${index}`}>
                {heading && (
                  <p className="px-3 pb-1 pt-3 text-[13px] text-ink-faint">
                    {heading}
                  </p>
                )}
                <button
                  type="button"
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(row)}
                  className={`flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-left text-[13px] ${
                    index === active
                      ? "bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] text-ink"
                      : "text-ink-muted"
                  }`}
                >
                  {(row.kind === "tag" || row.kind === "scope") && (
                    <span
                      aria-hidden
                      style={{ "--h": hueOf(row.name) } as React.CSSProperties}
                      className="hue-dot size-[7px] shrink-0 rounded-full"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {row.kind === "command"
                      ? row.command.label
                      : row.kind === "note"
                        ? row.title || "Untitled"
                        : `#${row.name}`}
                  </span>
                  {row.kind === "command" && row.command.shortcut && (
                    <span className="shrink-0 font-mono text-[13px] text-ink-faint">
                      {row.command.shortcut}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
