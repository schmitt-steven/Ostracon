// Character count of what a reader would actually *read* in a note body, used
// to rank notes by how much is written in them.
//
// The point of stripping is that markup shouldn't buy a note a higher rank.
// Images are the clearest case — pasting a screenshot inserts a blob URL that
// is longer than most paragraphs — but link targets, fences and emphasis marks
// inflate a raw `length` the same way.

// Images first, before links: `![alt](url)` also matches the link pattern, and
// running links first would leave a stray `!` plus the alt text behind.
const IMAGE_INLINE = /!\[[^\]]*\]\([^)]*\)/g;
const IMAGE_REFERENCE = /!\[[^\]]*\]\[[^\]]*\]/g;
const IMAGE_HTML = /<img\b[^>]*>/gi;

// Links keep their label and lose their target: the label is read, the URL is
// plumbing.
const LINK_INLINE = /\[([^\]]*)\]\([^)]*\)/g;
// `[[Target|shown]]` renders as "shown"; `[[Target]]` renders as "Target".
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

// Fence delimiters and their language tag are markup — the code between them
// is text the user wrote, so it stays.
const FENCE_DELIMITER = /^\s*(```|~~~).*$/gm;
// Leading line markup: heading hashes, quote arrows, list bullets, table pipes.
const LINE_PREFIX = /^\s*(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm;
// Emphasis, inline-code ticks and the table/rule characters left over.
const INLINE_MARKS = /[*_~`|]/g;

/**
 * How many images a body embeds.
 *
 * All three forms are counted off the same patterns the length discount uses,
 * so "this note has images" and "images don't inflate its rank" can never
 * disagree about what an image is.
 */
export function countImages(bodyMd: string): number {
  return (
    (bodyMd.match(IMAGE_INLINE)?.length ?? 0) +
    (bodyMd.match(IMAGE_REFERENCE)?.length ?? 0) +
    (bodyMd.match(IMAGE_HTML)?.length ?? 0)
  );
}

/**
 * Number of characters of readable text in a markdown body, with images and
 * markup discounted. Whitespace is collapsed so that reformatting a note
 * (hard-wrapping a paragraph, say) doesn't change its rank.
 */
export function textLength(bodyMd: string): number {
  const text = bodyMd
    .replace(IMAGE_INLINE, "")
    .replace(IMAGE_REFERENCE, "")
    .replace(IMAGE_HTML, "")
    .replace(LINK_INLINE, "$1")
    .replace(WIKILINK, (_m, target: string, label?: string) => label ?? target)
    .replace(FENCE_DELIMITER, "")
    .replace(LINE_PREFIX, "")
    .replace(INLINE_MARKS, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length;
}
