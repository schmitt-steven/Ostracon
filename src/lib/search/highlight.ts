/**
 * Turning "this note matched" into "here is the word that matched".
 *
 * Everything here returns *spans* — an array of `{ text, hit }` — rather than
 * a string with markup in it. The palette renders them as sibling elements in
 * JSX, so a note titled `<img onerror=…>` is text on the way in and text on
 * the way out. There is no HTML in this pipeline to inject into.
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
 * One case-insensitive pattern over every matched term, longest first.
 *
 * Order matters: MiniSearch's prefix search reports both `deploy` and
 * `deployments` as matched terms for the query `deploy`, and alternation takes
 * the first branch that matches rather than the longest, so the short one
 * would win and leave `ments` unhighlighted beside it.
 *
 * `\p{L}`-bounded on the left only. Anchoring the right would undo prefix
 * search — the point of matching `deploy` is that it lights up inside
 * `deployments` — while the left edge stops `ploy` from marking the middle of
 * a word nobody searched for.
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

/**
 * A window of `text` centred on the first match, highlighted.
 *
 * The row has one line to explain itself with, and the matched word is the
 * only part of the note that earned the row its place — so the window follows
 * the match rather than starting at the top of the note. `…` marks each end
 * that was cut, which is why the ellipses in the list are usually leading.
 */
export function excerpt(text: string, terms: string[], limit = 110): Span[] {
  return around(text, terms, limit) ?? head(text, limit);
}

/**
 * The window, or `null` when no term is in this text.
 *
 * Split out from [excerpt] so [snippet] can tell "no match here" from "no
 * match anywhere" — the first is worth trying a second source for, the second
 * is worth admitting to.
 */
function around(text: string, terms: string[], limit: number): Span[] | null {
  const re = pattern(terms);
  // `exec`, not `match`. [pattern] is global — it has to be, for [highlight]'s
  // `matchAll` — and `String.match` against a global regex returns the list of
  // matched *strings* with no `index` on it. Reading `.index` off that is
  // always `undefined`, which silently turned every excerpt into the note's
  // opening line: the exact "why is this row here, nothing is highlighted"
  // bug this window exists to prevent. `exec` on a freshly built regex starts
  // at 0 and reports the offset.
  const first = re ? re.exec(text) : null;
  if (!first) return null;

  // A third of the window ahead of the match, the rest after it: the words
  // *following* a hit are what tell you which sense of it this note meant.
  const lead = Math.floor(limit / 3);
  let from = Math.max(0, first.index - lead);
  // Never cut mid-word at the front; the space search is bounded so a long
  // unbroken run can't push the window past the match itself.
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
 * Where the spans came from, so a caller can say so.
 *
 * - `text` — the note's prose. The ordinary case, and the only one that needs
 *   no explanation.
 * - `raw` — the markdown behind it. The term is real but [plainText] strips
 *   whatever holds it: a link's URL, a fenced block, an image's alt text.
 * - `none` — nothing to show. A prefix-and-fuzzy index can match a term the
 *   note never spells, and a row that answers that by printing its opening
 *   line is the one that reads as a broken search.
 */
export type SnippetSource = "text" | "raw" | "none";

export type Snippet = { spans: Span[]; source: SnippetSource };

/**
 * The one line a result row gets, aimed at whatever actually matched.
 *
 * Two sources because the index and the display disagree by design: the search
 * runs over the raw markdown, so `vercel` inside `](https://vercel.com)` is a
 * true hit, while the row renders prose with the markup taken off — and there
 * the word is gone. Falling through to the raw body keeps the highlight on
 * screen; failing that, `none` lets the row explain itself in words instead of
 * showing an opening line with nothing marked in it.
 *
 * With no terms at all (the query-less list) there is nothing to aim at and
 * nothing to excuse, so the opening line is the answer.
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
