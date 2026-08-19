"use client";

import { RelativeDate } from "@/components/ui/RelativeDate";
import type { NoteHit } from "@/hooks/use-search-index";
import { countMatches, excerpt, highlight } from "@/lib/search/highlight";
import { tagMatches } from "@/lib/tags/parse";
import { Highlighted } from "./Highlighted";
import type { Row } from "./types";

type Props = {
  /** The highlighted row. Never absent in practice — see [CommandPalette]. */
  row: Row | undefined;
  /** Every tag in use, for listing a tag's children. */
  tags: string[];
  hueOf: (name: string) => number;
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
export function PalettePreview({ row, tags, hueOf }: Props) {
  return (
    <aside
      // Not a live region: `aria-activedescendant` on the input already
      // announces the row this pane is describing, and a second announcement
      // of the same move is what makes a palette exhausting to hear.
      className="palette-zone hidden min-h-0 flex-col px-6 py-5 md:flex"
    >
      <p className="shrink-0 pb-3 text-[11px] uppercase tracking-wider text-ink-faint">
        Preview
      </p>
      {row?.kind === "note" && <NotePreview row={row} hueOf={hueOf} />}
      {row?.kind === "tag" && <TagPreview row={row} tags={tags} hueOf={hueOf} />}
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
          all. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [overflow-wrap:anywhere]">
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
}: {
  row: Extract<Row, { kind: "note" }>;
  hueOf: (name: string) => number;
}) {
  const { note } = row;
  const words = note.text.split(/\s+/).filter(Boolean).length;

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
        <p className="flex flex-wrap gap-x-2.5 gap-y-1 text-[12px]">
          {note.tags.map((name) => (
            <span
              key={name}
              style={{ "--h": hueOf(name) } as React.CSSProperties}
              className="hue-text"
            >
              #{name}
            </span>
          ))}
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-ink-muted">
        {/* A longer window than the row's, around the same match: the row
            answers "is this the one?", this answers "what does it say?". */}
        <Highlighted spans={excerpt(note.text, note.terms, 320)} />
      </p>
    </Pane>
  );
}

function TagPreview({
  row,
  tags,
  hueOf,
}: {
  row: Extract<Row, { kind: "tag" }>;
  tags: string[];
  hueOf: (name: string) => number;
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
          <Meta label="⇥">Search only #{row.name}</Meta>
        </>
      }
    >
      <div
        style={{ "--h": hueOf(row.name) } as React.CSSProperties}
        className="flex flex-col gap-3"
      >
        <h2 className="hue-text font-display text-[19px] leading-snug">
          #{row.name}
        </h2>
        <p className="text-[14px] text-ink-muted">
          {row.count} {row.count === 1 ? "note" : "notes"}
          {children.length > 0 && ", sub-tags counted in"}
        </p>

        {children.length > 0 && (
          <p className="flex flex-wrap gap-x-2.5 gap-y-1 text-[12px]">
            {children.map((name) => (
              <span
                key={name}
                style={{ "--h": hueOf(name) } as React.CSSProperties}
                className="hue-text"
              >
                #{name}
              </span>
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
          <Meta label={row.action.shortcut}>Runs this without arrowing to it</Meta>
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
  const counted = [
    inTitle > 0 && `${inTitle} in title`,
    inBody > 0 && `${inBody} in body`,
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
