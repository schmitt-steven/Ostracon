"use client";

import { RelativeDate } from "@/components/ui/RelativeDate";
import type { NoteHit } from "@/hooks/use-search-index";
import {
  countMatches,
  excerpt,
  highlight,
  snippet,
} from "@/lib/search/highlight";
import { tagMatches } from "@/lib/tags/parse";
import { Highlighted } from "./Highlighted";
import type { Row } from "./types";
import Link from "next/link";
import { tagHref } from "@/lib/tags/routes";

type Props = {
  /** The highlighted row. Never absent in practice — see [CommandPalette]. */
  row: Row | undefined;
  /** Every tag in use, for listing a tag's children. */
  tags: string[];
  hueOf: (name: string) => number;
  /** That the pane has sent you somewhere, the palette closes behind it. */
  onNavigate: () => void;
};

/**
 * The right half, which is always there.
 *
 * A preview pane that appears for notes and collapses for everything else
 * would make the palette change width as you arrow down a list — so a tag and
 * an action get a summary here too. There is no state in which this pane is
 * empty, because there is no state in which no row is highlighted: the Actions
 * section always has at least one row in it.
 */
export function PalettePreview({ row, tags, hueOf, onNavigate }: Props) {
  return (
    <aside
      // Not a live region: `aria-activedescendant` on the input already
      // announces the row this pane is describing, and a second announcement
      // of the same move is what makes a palette exhausting to hear.
      //
      // Held off the palette's right and bottom edges rather than filling the
      // column to them, so the tonal step reads as a card lying on the panel
      // instead of as a second panel butted against it. The margin is what
      // makes the radius legible — a rounded corner flush into the frame's own
      // corner is just a nick out of the panel. Same --radius-zone as the
      // palette around it: this is a zone, and the app has exactly two radii.
      className="zone-step mb-3 mr-3 mt-3 hidden min-h-0 flex-col rounded-[var(--radius-zone)] px-5 py-4 md:flex"
    >
      {/* "Preview" over an action would promise a look at the thing before it
          happens, which is not what this pane does — it explains what the verb
          is and which key runs it. Notes and tags do get shown a piece of the
          thing itself, so those keep the word. */}
      <p className="shrink-0 pb-3 text-[11px] uppercase tracking-wider text-ink-faint">
        {row?.kind === "action" ? "Info" : "Preview"}
      </p>
      {row?.kind === "note" && (
        <NotePreview row={row} hueOf={hueOf} onNavigate={onNavigate} />
      )}
      {row?.kind === "tag" && (
        <TagPreview
          row={row}
          tags={tags}
          hueOf={hueOf}
          onNavigate={onNavigate}
        />
      )}
      {row?.kind === "action" && <ActionPreview row={row} />}
    </aside>
  );
}

/**
 * The shape every preview takes: prose that scrolls, facts that don't.
 *
 * `meta` is pinned to the foot of the pane rather than following the text,
 * because it is the part you compare *between* rows — a word count that lands
 * at a different height for every note is one you have to hunt for each time
 * you press the down arrow. Bottom-aligned rather than top-aligned so an
 * extra line (a note with images) grows upward and leaves the rest in place.
 */
function Pane({
  children,
  meta,
}: {
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* `overflow-wrap` is inherited, so one declaration here covers the
          title, the excerpt and the tag list. Notes contain pasted URLs and
          blob ids — text with no space in it for a hundred characters — and
          the default only breaks between words, which for those means not at
          all.

          The inset-and-bleed is where the tag pills get their padding from.
          It has to be here rather than on the tag row itself: this element is
          the clipping box, so a negative margin *inside* it is overflow —
          `overflow-y: auto` forces the used `overflow-x` to `auto` as well,
          and six stray pixels on the right become a scrollbar under every
          tagged note. Widening the box instead puts that space inside the
          scroll port, where a pill can sit in it and nothing overflows. The
          content box lands exactly where it did, so nothing else moves. */}
      <div className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 [overflow-wrap:anywhere]">
        {children}
      </div>
      {meta && (
        <dl className="mt-4 flex shrink-0 flex-col gap-1.5 text-[12px] [overflow-wrap:anywhere]">
          {meta}
        </dl>
      )}
    </div>
  );
}

function NotePreview({
  row,
  hueOf,
  onNavigate,
}: {
  row: Extract<Row, { kind: "note" }>;
  hueOf: (name: string) => number;
  onNavigate: () => void;
}) {
  const { note } = row;
  const words = note.text.split(/\s+/).filter(Boolean).length;
  // The same window the row uses, opened wider. Where the row has to admit it
  // has nothing to show, this pane has the space to show the note anyway — the
  // Matches line below already names the term that matched, so an unhighlighted
  // opening line here is context rather than a claim.
  const body = snippet(note.text, note.raw, note.terms, 320);
  const spans =
    body.source === "none" ? excerpt(note.text, [], 320) : body.spans;

  return (
    <Pane
      meta={
        <>
          <Meta label="Edited">
            <RelativeDate date={note.updatedAt} />
            {", "}
            <span suppressHydrationWarning>
              {new Date(note.updatedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </Meta>
          <Meta label="Words">{words}</Meta>
          {/* Only when there are any. A standing "Images 0" on every note
              would spend a line saying nothing about most of them. The label
              already says what is being counted, so the value is a number,
              like the one above it. */}
          {note.images > 0 && <Meta label="Images">{note.images}</Meta>}
          {/* Only with a query behind it. On a recent row there is nothing to
              have matched, and "0 matches" would read as a failed search. */}
          {note.reason.kind !== "recent" && (
            <Meta label="Matches">{matchSummary(note)}</Meta>
          )}
        </>
      }
    >
      <h2 className="font-display text-[19px] leading-snug text-ink">
        <Highlighted spans={highlight(note.title || "Untitled", note.terms)} />
      </h2>

      {note.tags.length > 0 && (
        // The pill's height, given back. These are flex items, so unlike the
        // inline tags this replaced they take their padding as height — four
        // pixels the pane didn't have. The pill grows into the gap above and
        // below instead, and the row measures what it did as bare text. Its
        // *width* is handled a level up, on the scroll container: a negative
        // margin here would overflow that box rather than fit inside it.
        <p className="-my-0.5 flex flex-wrap gap-x-1 gap-y-0.5 text-[12px]">
          {note.tags.map((name) => (
            <TagLink
              key={name}
              name={name}
              hueOf={hueOf}
              onNavigate={onNavigate}
            />
          ))}
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-ink-muted">
        {/* A longer window than the row's, around the same match: the row
            answers "is this the one?", this answers "what does it say?". */}
        <Highlighted spans={spans} />
      </p>
    </Pane>
  );
}

function TagPreview({
  row,
  tags,
  hueOf,
  onNavigate,
}: {
  row: Extract<Row, { kind: "tag" }>;
  tags: string[];
  hueOf: (name: string) => number;
  onNavigate: () => void;
}) {
  const children = tags.filter(
    (name) => name !== row.name && tagMatches(name, row.name),
  );

  return (
    <Pane
      // Both keys spelled out, because a tag is the one row where the two
      // verbs go to genuinely different places.
      meta={
        <>
          <Meta label="⏎">Open the #{row.name} index</Meta>
          <Meta label="⇥">Narrow the search to #{row.name}</Meta>
        </>
      }
    >
      <div
        style={{ "--h": hueOf(row.name) } as React.CSSProperties}
        className="flex flex-col gap-3"
      >
        {/* Clickable too, though ⏎ already goes here: a heading sitting dead
            above a list of sub-tags that all follow a click is the odd one
            out, and the mouse shouldn't have to reach back to the row. */}
        <h2 className="font-display text-[19px] leading-snug">
          <Link
            href={tagHref(row.name)}
            title={`All notes tagged #${row.name}`}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              onNavigate();
            }}
            className="hue-text focus-visible:outline-none!"
          >
            #{row.name}
          </Link>
        </h2>
        <p className="text-[14px] text-ink-muted">
          {row.count} {row.count === 1 ? "note" : "notes"}
          {children.length > 0 && ", sub-tags counted in"}
        </p>

        {children.length > 0 && (
          <p className="-my-0.5 flex flex-wrap gap-x-1 gap-y-0.5 text-[12px]">
            {children.map((name) => (
              <TagLink
                key={name}
                name={name}
                hueOf={hueOf}
                onNavigate={onNavigate}
              />
            ))}
          </p>
        )}
      </div>
    </Pane>
  );
}

function ActionPreview({ row }: { row: Extract<Row, { kind: "action" }> }) {
  return (
    <Pane
      meta={
        row.action.shortcut ? (
          <Meta label={row.action.shortcut}>
            Runs this without arrowing to it
          </Meta>
        ) : undefined
      }
    >
      <h2 className="font-display text-[19px] leading-snug text-ink">
        {row.action.label}
      </h2>
      <p className="text-[14px] leading-relaxed text-ink-muted">
        {row.action.detail}
      </p>
    </Pane>
  );
}

/**
 * Where the term was found, counted.
 *
 * The last case is the one worth spelling out. The search is prefix-and-fuzzy,
 * so a note can earn its row on a term the visible text never spells — you
 * typed `vecel` and the index matched `vercel`, or the word sits inside markup
 * that [plainText] strips before any of this counts it. There is nothing to
 * count and nothing to highlight, so the row names the term it matched
 * instead: seeing `“vercel”` under a query of `vecel` explains both why the
 * note is here and why no word in it is marked.
 */
function matchSummary(note: NoteHit): string {
  const inTitle = countMatches(note.title, note.terms);
  const inBody = countMatches(note.text, note.terms);
  // Counted off the raw markdown only when the prose has none, and named for
  // where it actually is: a hit inside a link's URL or a fenced block is a
  // true match that the rendered note never shows, and calling it "in body"
  // would send someone hunting for a word that isn't there to find.
  const inMarkup = inBody > 0 ? 0 : countMatches(note.raw, note.terms);
  const counted = [
    inTitle > 0 && `${inTitle} in title`,
    inBody > 0 && `${inBody} in body`,
    inMarkup > 0 && `${inMarkup} in markup`,
  ].filter(Boolean) as string[];

  if (counted.length > 0) return counted.join(" · ");
  if (note.reason.kind === "tag") return `tag #${note.reason.tag}`;
  if (note.terms.length === 0) return "—";
  return note.terms
    .slice(0, 2)
    .map((term) => `“${term}”`)
    .join(", ");
}

/** A label/value pair. Aligned by grid rather than by a rule between them. */
function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-ink-muted">{children}</dd>
    </div>
  );
}

/**
 * A tag in the preview as a link.
 * ⌘-click opens the index in a new tab, and the palette stays where it was instead of
 * closing behind a page that never loaded.
 */
function TagLink({
  name,
  hueOf,
  onNavigate,
}: {
  name: string;
  hueOf: (name: string) => number;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={tagHref(name)}
      title={`All notes tagged #${name}`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        onNavigate();
      }}
      style={{ "--h": hueOf(name) } as React.CSSProperties}
      className="tag-pill hue-text px-1.5 py-0.5 focus-visible:outline-none!"
    >
      #{name}
    </Link>
  );
}
