/**
 * What a tag is, and where one may be created. A note's tags live in
 * frontmatter, edited only via the tag bar — the one way a tag comes into
 * existence. Hashtags in the body are references (like `[[wikilinks]]`): they
 * resolve against existing tags, never create one. Isomorphic (no
 * "server-only") so the editor's highlighting and the server's linking use one
 * set of rules.
 */

/**
 * A tag name: a non-punctuation first char, then word chars and dashes, then
 * `/`-separated child segments. Unicode-aware (`\p{L}`); excludes `.` and `,`
 * so `#qa.` ends at `qa`.
 */
const TAG_BODY = String.raw`[\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*`;

/** Anchored at a `#`; the caller checks what precedes it (see `scan`). */
const TAG_RE = new RegExp(String.raw`#(${TAG_BODY})`, "gu");

/** The same shape, anchored — for validating a name that arrived some other way. */
const TAG_EXACT_RE = new RegExp(String.raw`^${TAG_BODY}$`, "u");

// Fenced then inline code. Replaced with equal-length spaces, not removed, so
// every offset this module reports still lines up with the original text.
const FENCE_RE = /^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:^[ \t]*\1[^\n]*$|$)/gm;
const INLINE_CODE_RE = /(`+)(?:[^`]|(?!\1)`)*\1/g;

function blank(match: string): string {
  // Newlines survive so line numbers don't shift.
  return match.replace(/[^\n]/g, " ");
}

/**
 * The body with code spans blanked out — a `#include` or a CSS colour literal
 * is not a tag.
 */
function maskCode(bodyMd: string): string {
  return bodyMd.replace(FENCE_RE, blank).replace(INLINE_CODE_RE, blank);
}

/** A tag occurrence in the source text. Offsets are into the *original* body. */
export type TagMatch = {
  /** Normalised name, without the `#`. */
  name: string;
  /** Offset of the `#`. */
  from: number;
  /** Offset just past the last character of the name. */
  to: number;
};

/**
 * Lowercase — the stored form. `#QA` and `#qa` are one tag; what the user
 * typed stays untouched in the body.
 */
export function normalizeTag(name: string): string {
  return name.toLowerCase();
}

/** Whether a string is usable as a tag name (no `#`, already normalised). */
export function isValidTag(name: string): boolean {
  return TAG_EXACT_RE.test(name);
}

/**
 * Every hashtag occurrence in a body, in document order. A `#` only opens a
 * tag at the start or after whitespace, which keeps URL anchors, `[](#section)`
 * links and `##` headings out without a real markdown parse.
 */
export function scanTags(bodyMd: string): TagMatch[] {
  const masked = maskCode(bodyMd);
  const found: TagMatch[] = [];

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(masked)) !== null) {
    const before = match.index === 0 ? "" : masked[match.index - 1]!;
    if (before !== "" && !/\s/.test(before)) continue;
    found.push({
      name: normalizeTag(match[1]!),
      from: match.index,
      to: match.index + match[0].length,
    });
  }

  return found;
}

/**
 * Every distinct tag referenced in a body, first-appearance order. Not the
 * note's tag list (see [resolveNoteTags]) — used for legacy notes and for
 * knowing which names a body mentions.
 */
function extractTags(bodyMd: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const { name } of scanTags(bodyMd)) {
    if (seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

/**
 * Names as a tag list: normalised, validated, de-duped, order kept. Bad names
 * are dropped, not repaired. Order is load-bearing — the first tag is the
 * note's default context and its wash colour (see [resolveContextTag]).
 */
export function normalizeTagList(names: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of names) {
    const name = normalizeTag(raw.trim().replace(/^#/, ""));
    if (!name || seen.has(name) || !isValidTag(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

/**
 * The tags a note is filed under. `frontmatterTags` wins outright, empty
 * included ("deliberately untagged"). `null` means no record at all — a
 * pre-frontmatter note, read from its body hashtags once until the next save.
 */
export function resolveNoteTags(
  frontmatterTags: string[] | null,
  bodyMd: string,
): string[] {
  return normalizeTagList(frontmatterTags ?? extractTags(bodyMd));
}

/**
 * Every name that counts as existing: each tag in use plus its ancestors, so
 * `#infra` resolves when only `#infra/ci` is filed.
 */
export function tagNameSet(tagLists: Iterable<string[]>): Set<string> {
  const names = new Set<string>();
  for (const tags of tagLists) {
    for (const tag of tags) {
      for (const ancestor of tagAncestry(tag)) names.add(ancestor);
    }
  }
  return names;
}

/**
 * Every ancestor of a nested tag, itself included: `infra/ci/nightly` gives
 * `infra`, `infra/ci`, `infra/ci/nightly`.
 */
export function tagAncestry(name: string): string[] {
  const parts = name.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Whether `tag` is `ancestor` or sits beneath it. */
export function tagMatches(tag: string, ancestor: string): boolean {
  return tag === ancestor || tag.startsWith(`${ancestor}/`);
}

// Markup stripped from a one-line snippet. Cheap — runs over every note.
const SNIPPET_STRIP: [RegExp, string][] = [
  [/^---\n[\s\S]*?\n---\n/, ""], // frontmatter, if any survived
  [/```[\s\S]*?```/g, " "],
  [/`([^`]*)`/g, "$1"],
  [/!\[[^\]]*\]\([^)]*\)/g, " "],
  [/\[([^\]]*)\]\([^)]*\)/g, "$1"],
  [/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1"],
  [/^\s{0,3}#{1,6}\s+/gm, ""],
  [/^\s{0,3}>\s?/gm, ""],
  [/^\s{0,3}[-*+]\s+/gm, ""],
  [/^\s{0,3}\d+\.\s+/gm, ""],
  [/[*_~]/g, ""],
];

/**
 * A note's prose with markup, syntax and hashtags stripped, on one line. Split
 * from [noteSnippet] so the search menu can window around a match without the
 * truncation. Hashtags go because every surface renders the tags separately.
 */
export function plainText(bodyMd: string): string {
  let text = bodyMd;
  for (const [pattern, replacement] of SNIPPET_STRIP) {
    text = text.replace(pattern, replacement);
  }
  // Stripped at masked positions so a `#` in a code span can't shift offsets.
  const matches = scanTags(text);
  for (let i = matches.length - 1; i >= 0; i--) {
    const { from, to } = matches[i]!;
    text = text.slice(0, from) + text.slice(to);
  }

  return text.replace(/\s+/g, " ").trim();
}

/** The one muted line under a title in the index. */
export function noteSnippet(bodyMd: string, limit = 120): string {
  const text = plainText(bodyMd);
  if (text.length <= limit) return text;
  // Cut at a word boundary when one's within reach.
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
