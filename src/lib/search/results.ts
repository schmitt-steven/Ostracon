/**
 * Why a note is in the list — every palette row has to say what put it there.
 * A tagged union, not a string: the reason drives ordering as well as wording.
 */
export type MatchReason =
  | { kind: "title" }
  | { kind: "body" }
  /** Matched only through one of its tags — the body never mentions the term. */
  | { kind: "tag"; tag: string }
  /** No query at all: the row is here because it was touched recently. */
  | { kind: "recent" };

// Title above body above tag-only — a tag match is the weakest hit (every note
// under `#vercel` matches "vercel" equally).
const RANK: Record<MatchReason["kind"], number> = {
  title: 0,
  body: 1,
  tag: 2,
  recent: 3,
};

function reasonRank(reason: MatchReason): number {
  return RANK[reason.kind];
}

/** Which fields a hit matched, into a reason. Title wins over body. */
export function reasonFrom(
  fields: ReadonlySet<string>,
  tags: readonly string[],
  terms: readonly string[],
): MatchReason {
  if (fields.has("title")) return { kind: "title" };
  if (fields.has("bodyMd")) return { kind: "body" };

  // A tag reason must name a tag; fall back to "body" if the fuzzy match
  // doesn't correspond to a literal tag.
  const tag = matchedTag(tags, terms);
  return tag ? { kind: "tag", tag } : { kind: "body" };
}

/** The tag that earned a tag-only match its row. */
function matchedTag(
  tags: readonly string[],
  terms: readonly string[],
): string | undefined {
  const wanted = terms.map((term) => term.toLowerCase());
  // Deepest first — the more specific match, and the one the chip doesn't show.
  return [...tags]
    .sort((a, b) => b.length - a.length)
    .find((tag) => wanted.some((term) => tag.toLowerCase().includes(term)));
}

/**
 * Stable sort by reason band — the incoming MiniSearch score order survives
 * inside each band.
 */
export function byReason<T extends { reason: MatchReason }>(results: T[]): T[] {
  return [...results].sort(
    (a, b) => reasonRank(a.reason) - reasonRank(b.reason),
  );
}
