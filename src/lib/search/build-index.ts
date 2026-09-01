import MiniSearch, { type Options } from "minisearch";

export type NoteDoc = {
  id: string;
  slug: string;
  title: string;
  bodyMd: string;
  tags: string[];
  updatedAt: string;
};

/** Endings that only look like plurals: `css`, `status`, `analysis`, `this`. */
const NOT_PLURAL = /(?:ss|us|is)$/;
/** `classes`, `boxes`, `matches` — the `es` is the plural, not just the `s`. */
const ES_PLURAL = /(?:s|x|z|ch|sh)es$/;
/** `queries`, `libraries`: the `y` became `ies`. */
const IES_PLURAL = /[^aeiou]ies$/;
/** `query`, `library` — the singular half of the rule above. */
const CONSONANT_Y = /[^aeiou]y$/;

/**
 * Folds a term so a word and its plural share a token — `etfs` should find a
 * note that only spells it `ETF`. Every fold is a left-truncation, never a
 * rewrite (`queries` and `query` both fold to `quer`), so the search menu's
 * left-anchored highlight can always find the stem in the note. The same
 * function runs over the index and the query; it must not merge two different
 * words.
 */
function stemTerm(term: string): string {
  const lower = term.toLowerCase();
  // Too short to fold safely: `is`, `was`, `aws`, `css`.
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
  // Runs over both the indexed documents and the query.
  processTerm: stemTerm,
};

export function createSearchIndex(): MiniSearch<NoteDoc> {
  return new MiniSearch<NoteDoc>(SEARCH_INDEX_OPTIONS);
}
