/**
 * What a tag is, and where one may be created.
 *
 * A note's tags live in its frontmatter and are edited in one place — the tag
 * bar above the editor. That is the only way a tag comes into existence.
 *
 * Hashtags in the body are *references*: `#infra` in a sentence links to that
 * tag's index the way `[[a title]]` links to a note, and like a wikilink it
 * resolves against what already exists rather than conjuring it. A `#` in front
 * of a word that isn't a tag yet is just a `#` in front of a word. That split
 * is the whole point — filing a note is a deliberate act in a fixed place,
 * instead of something that happens wherever the word landed in the prose.
 *
 * The `tags` column is a derived index that a save rewrites, never something a
 * reader has to reconcile against the text.
 *
 * Isomorphic on purpose (no "server-only"): the editor highlights and
 * autocompletes hashtag references from the same rules the server links them
 * by, and two regexes that drifted apart would light up one set of references
 * and render another.
 */

/**
 * A tag name: a first character that isn't punctuation, then word characters
 * and dashes, then any number of `/`-separated child segments.
 *
 * Unicode-aware (`\p{L}`) so `#größe` and `#日本語` are tags rather than being
 * cut at the first non-ASCII byte. The class deliberately excludes `.` and
 * `,` so `#qa.` ends the tag at `qa` and leaves the sentence its full stop.
 */
const TAG_BODY = String.raw`[\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*`;

/** Anchored at a `#`; the caller checks what precedes it (see `scan`). */
const TAG_RE = new RegExp(String.raw`#(${TAG_BODY})`, "gu");

/** The same shape, anchored — for validating a name that arrived some other way. */
const TAG_EXACT_RE = new RegExp(String.raw`^${TAG_BODY}$`, "u");

/**
 * Fenced code, then inline code. Both are replaced with spaces of the same
 * length rather than removed, so every offset this module reports still points
 * at the right character in the original text — the editor's highlighting
 * depends on that.
 */
const FENCE_RE = /^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:^[ \t]*\1[^\n]*$|$)/gm;
const INLINE_CODE_RE = /(`+)(?:[^`]|(?!\1)`)*\1/g;

function blank(match: string): string {
  // Newlines survive so line numbers don't shift underneath the masked span.
  return match.replace(/[^\n]/g, " ");
}

/**
 * The body with every code span blanked out. A `#include` in a C snippet is
 * not a tag, and neither is a colour literal in a CSS block — the single most
 * common false positive in a notes app aimed at software engineering.
 */
export function maskCode(bodyMd: string): string {
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
 * Tags are compared case-insensitively, so `#QA` and `#qa` are one tag rather
 * than two rows in the rail that look identical. Lowercase is the stored form;
 * what the user typed stays untouched in the body.
 */
export function normalizeTag(name: string): string {
  return name.toLowerCase();
}

/** Whether a string is usable as a tag name (no `#`, already normalised). */
export function isValidTag(name: string): boolean {
  return TAG_EXACT_RE.test(name);
}

/**
 * Every hashtag occurrence in a body, in document order.
 *
 * A `#` only opens a tag at the start of the text or after whitespace. That
 * one rule is what keeps `https://example.com/#anchor`, `[link](#section)` and
 * `##` heading markup out — all three have a non-space character in front —
 * without needing to parse markdown properly here.
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
 * Every distinct tag *referenced* in a body, in the order they first appear.
 *
 * This is not the note's tag list — see [resolveNoteTags]. It has two uses:
 * reading the tags of a legacy note written before the bar existed, and
 * knowing which names a body mentions.
 */
export function extractTags(bodyMd: string): string[] {
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
 * A list of names as a tag list: normalised, validated, de-duplicated, order
 * kept. Anything that isn't a usable tag name is dropped rather than repaired
 * — the bar validates before it commits, so a bad name reaching here came from
 * a hand-written request.
 *
 * Order is load-bearing: the first tag is what a note is read under when it
 * was reached from somewhere with no tag of its own — a bookmark, a backlink,
 * the rail (see [resolveContextTag]) — and so what the editor washes the pane
 * in. Sorting here would make the wash colour depend on the alphabet instead
 * of on what the note is about.
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
 * The tags a note is filed under.
 *
 * `frontmatterTags` is the note's own record and wins outright — including
 * when it is empty, which means "deliberately untagged" and must not be
 * second-guessed by the hashtags still sitting in the prose.
 *
 * `null` is the other thing entirely: no record at all, i.e. a note last saved
 * before tags moved into frontmatter. Those are read the old way, once, and
 * the next save writes a real list. Without this a whole collection would
 * appear untagged the moment this shipped.
 */
export function resolveNoteTags(
  frontmatterTags: string[] | null,
  bodyMd: string,
): string[] {
  return normalizeTagList(frontmatterTags ?? extractTags(bodyMd));
}

/**
 * Every name that counts as existing, given the tags in use: each tag plus all
 * of its ancestors. `#infra` resolves as a reference when only `#infra/ci` is
 * filed anywhere, because `/t/infra` is a real index either way.
 */
export function knownTagSet(tagLists: Iterable<string[]>): Set<string> {
  const known = new Set<string>();
  for (const tags of tagLists) {
    for (const tag of tags) {
      for (const ancestor of tagAncestry(tag)) known.add(ancestor);
    }
  }
  return known;
}

/**
 * Every ancestor of a nested tag, including itself: `infra/ci/nightly` gives
 * `infra`, `infra/ci`, `infra/ci/nightly`. Filtering by `#infra` has to match
 * the notes tagged `#infra/ci`, or the tree in the rail would show counts that
 * don't survive being clicked on.
 */
export function tagAncestry(name: string): string[] {
  const parts = name.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Whether `tag` is `ancestor` or sits beneath it. */
export function tagMatches(tag: string, ancestor: string): boolean {
  return tag === ancestor || tag.startsWith(`${ancestor}/`);
}

// Markup that would otherwise show up as literal punctuation in a one-line
// snippet. Kept deliberately cheap — this runs over every note in the list.
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
 * A note's prose with its markup taken off: one line, no syntax, no hashtags.
 *
 * Split out from [noteSnippet] because the palette needs the same text without
 * the truncation — it cuts its own window around whichever word matched, which
 * is rarely in the first 120 characters.
 *
 * Hashtags come out because every surface that shows this text renders the
 * note's tags in their own hues alongside it — leaving them in the prose would
 * print every tag twice, once as grey punctuation and once as colour.
 */
export function plainText(bodyMd: string): string {
  let text = bodyMd;
  for (const [pattern, replacement] of SNIPPET_STRIP) {
    text = text.replace(pattern, replacement);
  }
  // Tags are stripped from the *masked* positions so a `#` inside a code span
  // (already blanked above) can't shift the offsets of the real ones.
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
  // Cut at a word boundary when there's one within reach, so the ellipsis
  // doesn't land mid-word.
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
