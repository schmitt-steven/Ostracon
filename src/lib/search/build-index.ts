import MiniSearch, { type Options } from "minisearch";

export type NoteDoc = {
  id: string;
  slug: string;
  title: string;
  bodyMd: string;
  tags: string[];
  updatedAt: string;
};

/**
 * Endings that only look like plurals: `css`, `status`, `analysis`, `this`.
 * Stripping these makes two unrelated words collide, which is the one failure
 * this whole thing has to avoid.
 */
const NOT_PLURAL = /(?:ss|us|is)$/;
/** `classes`, `boxes`, `matches` — the `es` is the plural, not just the `s`. */
const ES_PLURAL = /(?:s|x|z|ch|sh)es$/;
/** `queries`, `libraries`: the `y` became `ies`. */
const IES_PLURAL = /[^aeiou]ies$/;
/** `query`, `library` — the singular half of the rule above. */
const CONSONANT_Y = /[^aeiou]y$/;

/**
 * One term, folded so that a word and its plural are the same token.
 *
 * The problem this solves is asymmetry. `prefix: true` already covers typing
 * *less* than the word — `etf` finds `ETFs` because the stored term starts
 * with it — but nothing covered typing *more*: `etfs` missed a note that only
 * ever spelled it `ETF`. Fuzzy matching used to paper over that, at the price
 * of `next` matching `text`; folding the plural fixes it exactly, with no
 * neighbourhood of near-misses attached.
 *
 * **Every result is a truncation of its input, and that is load-bearing.**
 * The palette highlights by searching the note for the terms a hit matched,
 * with the pattern anchored on the left only — so a stem that is a prefix of
 * the word is always findable in the text, and `ETFs` lights up as `ETF`s.
 * A stem that *rewrote* letters would not be: `queries → query` would send the
 * row looking for a word the note doesn't contain and land it back on "not in
 * the note's text". Hence `queries` and `query` both fold to `quer` — the
 * shared prefix — rather than one being spelled into the other.
 *
 * Correctness matters less than consistency here: the same function runs over
 * the index and over the query, so even a linguistically wrong fold (`series`
 * → `serie`) still finds every note that spells it the same way. What it must
 * not do is merge two words that mean different things.
 */
function stemTerm(term: string): string {
  const lower = term.toLowerCase();
  // Too short to have a plural worth folding, and short words are where a
  // wrong fold does the most damage: `is`, `was`, `aws`, `css`.
  if (lower.length < 4) return lower;
  if (NOT_PLURAL.test(lower)) return lower;
  if (lower.length >= 6 && IES_PLURAL.test(lower)) return lower.slice(0, -3);
  if (CONSONANT_Y.test(lower)) return lower.slice(0, -1);
  if (ES_PLURAL.test(lower)) return lower.slice(0, -2);
  if (lower.endsWith("s")) return lower.slice(0, -1);
  return lower;
}

export const SEARCH_INDEX_OPTIONS: Options<NoteDoc> = {
  idField: "id",
  fields: ["title", "bodyMd", "tags"],
  storeFields: ["slug", "title", "tags", "updatedAt"],
  // Runs over the documents as they are indexed *and* over the query, which
  // is what makes the two halves meet in the middle.
  processTerm: stemTerm,
};

export function createSearchIndex(): MiniSearch<NoteDoc> {
  return new MiniSearch<NoteDoc>(SEARCH_INDEX_OPTIONS);
}
