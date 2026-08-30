/**
 * Why a note is in the list.
 *
 * Every row in the palette has to be able to say what put it there, because
 * the alternative — a title that plainly doesn't contain the word you typed,
 * with no explanation under it — reads as the search being broken. A tagged
 * union rather than a formatted string: the reason decides the row's order as
 * well as its wording, and sorting on prose is how you end up sorting
 * alphabetically by accident.
 */
export type MatchReason =
  | { kind: "title" }
  | { kind: "body" }
  /** Matched only through one of its tags — the body never mentions the term. */
  | { kind: "tag"; tag: string }
  /** No query at all: the row is here because it was touched recently. */
  | { kind: "recent" };

/**
 * Title above body above tag-only.
 *
 * A tag match is the weakest kind of hit — every note under `#vercel` matches
 * "vercel" equally well, so a hundred of them would bury the one note actually
 * about it. Sorting by reason first and letting relevance order each band is
 * what keeps those at the bottom without dropping them.
 */
const RANK: Record<MatchReason["kind"], number> = {
  title: 0,
  body: 1,
  tag: 2,
  recent: 3,
};

function reasonRank(reason: MatchReason): number {
  return RANK[reason.kind];
}

/**
 * Which fields a hit matched, into a reason.
 *
 * Title wins over body when both matched: it's the stronger statement about
 * what the note is, and it's the line the row leads with anyway.
 */
export function reasonFrom(
  fields: ReadonlySet<string>,
  tags: readonly string[],
  terms: readonly string[],
): MatchReason {
  if (fields.has("title")) return { kind: "title" };
  if (fields.has("bodyMd")) return { kind: "body" };

  // A tag reason has to be able to name its tag. The search is fuzzy, so a
  // note can match on the tags field through a term that no tag literally
  // contains — and "matched tag #" with nothing after it is worse than not
  // claiming a tag match at all.
  const tag = matchedTag(tags, terms);
  return tag ? { kind: "tag", tag } : { kind: "body" };
}

/**
 * The tag that earned a tag-only match its row.
 *
 * Named rather than implied: under `#vercel`, a row explaining itself with
 * `matched tag #vercel/test` is telling you something you could not otherwise
 * see, since the scope chip says `#vercel` and the note's own tag doesn't.
 */
function matchedTag(
  tags: readonly string[],
  terms: readonly string[],
): string | undefined {
  const wanted = terms.map((term) => term.toLowerCase());
  // Deepest first: `#vercel/test` is the more specific true answer whenever
  // both it and its parent match, and the parent is what the chip already says.
  return [...tags]
    .sort((a, b) => b.length - a.length)
    .find((tag) => wanted.some((term) => tag.toLowerCase().includes(term)));
}

/**
 * Stable sort by reason band, leaving relevance to order each band.
 *
 * `Array.prototype.sort` is specified as stable, so the incoming order — which
 * is MiniSearch's score, title-boosted — survives inside each band.
 */
export function byReason<T extends { reason: MatchReason }>(results: T[]): T[] {
  return [...results].sort(
    (a, b) => reasonRank(a.reason) - reasonRank(b.reason),
  );
}
