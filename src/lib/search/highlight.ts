/**
 * Turning "this note matched" into "here is the word that matched". Returns
 * spans (`{ text, hit }[]`), not marked-up strings — the search menu renders
 * them as JSX siblings, so there's no HTML to inject into.
 */

export type Span = {
  text: string;
  /** Whether this run is one of the matched terms. */
  hit: boolean;
};

/** So a term containing `.` or `(` can't compile into a pattern of its own. */
function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One case-insensitive pattern over every matched term, longest first
 * (alternation takes the first branch, not the longest). Left-bounded only, so
 * `deploy` still lights up inside `deployments`.
 */
function pattern(terms: string[]): RegExp | null {
  const usable = [...new Set(terms.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (usable.length === 0) return null;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(${usable.map(escape).join("|")})`,
    "giu",
  );
}

/**
 * Split `text` into alternating plain and matched runs.
 *
 * Always returns at least one span for non-empty text, so a caller can render
 * the result without also handling the no-match case separately.
 */
export function highlight(text: string, terms: string[]): Span[] {
  const re = pattern(terms);
  if (!re || !text) return text ? [{ text, hit: false }] : [];

  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const at = match.index;
    if (at > last) spans.push({ text: text.slice(last, at), hit: false });
    spans.push({ text: match[0], hit: true });
    last = at + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), hit: false });
  return spans;
}

/** How many times the terms occur in `text`. Feeds the preview's match count. */
export function countMatches(text: string, terms: string[]): number {
  const re = pattern(terms);
  return re ? [...text.matchAll(re)].length : 0;
}

/** A window of `text` centred on the first match, highlighted. */
export function excerpt(text: string, terms: string[], limit = 110): Span[] {
  return around(text, terms, limit) ?? head(text, limit);
}

/**
 * The window, or `null` when no term is in this text — split from [excerpt] so
 * [snippet] can tell "no match here" from "no match anywhere".
 */
function around(text: string, terms: string[], limit: number): Span[] | null {
  const re = pattern(terms);
  // `exec`, not `match` — [pattern] is global, and `String.match` on a global
  // regex drops `.index`.
  const first = re ? re.exec(text) : null;
  if (!first) return null;

  // A third of the window before the match, the rest after — the words after a
  // hit are what disambiguate its sense.
  const lead = Math.floor(limit / 3);
  let from = Math.max(0, first.index - lead);
  // Don't cut mid-word at the front; the space search is bounded.
  if (from > 0) {
    const space = text.indexOf(" ", from);
    if (space !== -1 && space < first.index) from = space + 1;
  }
  const to = Math.min(text.length, from + limit);

  const window = text.slice(from, to);
  const spans = highlight(window, terms);
  if (from > 0) spans.unshift({ text: "…", hit: false });
  if (to < text.length) spans.push({ text: "…", hit: false });
  return spans;
}

/** The opening of the text, cut to fit. What a row shows with nothing to aim at. */
function head(text: string, limit: number): Span[] {
  const opening = text.length > limit ? `${cutAtWord(text, limit)}…` : text;
  return opening ? [{ text: opening, hit: false }] : [];
}

/**
 * Where a snippet's spans came from: `text` (the prose), `raw` (the markdown,
 * when [plainText] stripped whatever held the term), or `none` (the index
 * matched a term the note never spells).
 */
export type SnippetSource = "text" | "raw" | "none";

export type Snippet = { spans: Span[]; source: SnippetSource };

/**
 * The one line a result row gets, aimed at whatever matched. Search runs over
 * raw markdown but the row renders stripped prose, so a hit inside a URL falls
 * through to `raw`, then to `none`. No terms (query-less list) → the opening line.
 */
export function snippet(
  text: string,
  raw: string,
  terms: string[],
  limit = 110,
): Snippet {
  if (terms.length === 0) return { spans: head(text, limit), source: "text" };

  const inText = around(text, terms, limit);
  if (inText) return { spans: inText, source: "text" };

  const inRaw = around(raw, terms, limit);
  if (inRaw) return { spans: inRaw, source: "raw" };

  return { spans: [], source: "none" };
}

/** Trim to `limit`, backing up to the last space if one is within reach. */
function cutAtWord(text: string, limit: number): string {
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}
