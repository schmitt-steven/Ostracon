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
  /** The highlighted row. Never absent in practice — see [SearchMenu]. */
  row: Row | undefined;
  /** Every tag in use, for listing a tag's children. */
  tags: string[];
  hueOf: (name: string) => number;
  /** That the preview has sent you somewhere, the search menu closes behind it. */
  onNavigate: () => void;
};

/**
 * The right half, always present — a note, tag or action gets a summary here,
 * so the search menu doesn't change width as you arrow down. Never empty: the
 * Actions section always has a row.
 */
export function SearchMenuPreview({ row, tags, hueOf, onNavigate }: Props) {
  return (
    <aside
      // Not a live region — the input's `aria-activedescendant` already
      // announces this row. Held off the search menu edges so it reads as a
      // card on the panel; same --radius-zone.
      className="zone-step mb-3 mr-3 mt-3 hidden min-h-0 flex-col rounded-[var(--radius-zone)] px-5 py-4 md:flex"
    >
      {/* "Info" for an action (no look-before), "Preview" for notes and tags. */}
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
 * Every preview's shape: prose that scrolls, `meta` pinned to the foot so it
 * lands at the same height for every row and grows upward.
 */
function PreviewBody({
  children,
  meta,
}: {
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* `[overflow-wrap:anywhere]` inherited by the title/excerpt/tags —
          notes carry pasted URLs with no break point. The `-mx-1.5` inset is
          padding for the tag pills, widening the scroll port so a pill in it
          doesn't force a horizontal scrollbar. */}
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
  // A seeded recent row only has its snippet — the real counts arrive with the
  // corpus, so leave those rows off until then.
  const words = note.partial
    ? null
    : note.text.split(/\s+/).filter(Boolean).length;
  // The row's window, opened wider — and where the row has nothing to show,
  // this shows the opening line anyway (the Matches line names the term).
  const body = snippet(note.text, note.raw, note.terms, 320);
  const spans =
    body.source === "none" ? excerpt(note.text, [], 320) : body.spans;

  return (
    <PreviewBody
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
          {words !== null && <Meta label="Words">{words}</Meta>}
          {/* Only when there are any, and only once the corpus can be sure. */}
          {!note.partial && note.images > 0 && (
            <Meta label="Images">{note.images}</Meta>
          )}
          {/* Only with a query — "0 matches" on a recent row reads as a fail. */}
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
        // `-my-0.5` gives back the pill padding so the row measures as bare
        // text; width is handled on the scroll container a level up.
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
        {/* A longer window than the row's, around the same match. */}
        <Highlighted spans={spans} />
      </p>
    </PreviewBody>
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
    <PreviewBody
      // Both keys spelled out — a tag's two verbs go to different places.
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
        {/* Clickable too, so the mouse doesn't have to reach back to the row. */}
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
    </PreviewBody>
  );
}

function ActionPreview({ row }: { row: Extract<Row, { kind: "action" }> }) {
  return (
    <PreviewBody
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
    </PreviewBody>
  );
}

/**
 * Where the term was found, counted. When there's nothing to count (a fuzzy
 * hit, or a term only in stripped markup), the row names the term instead.
 */
function matchSummary(note: NoteHit): string {
  const inTitle = countMatches(note.title, note.terms);
  const inBody = countMatches(note.text, note.terms);
  // Off the raw markdown only when the prose has none, and named "in markup"
  // so nobody hunts the rendered note for a word that isn't there.
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

/** A tag in the preview, as a link. ⌘-click opens a new tab and the search menu
 * stays put. */
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
