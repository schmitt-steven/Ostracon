import "server-only";
import type { Root } from "hast";
import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { remarkWikilink, type WikilinkResolver } from "./remark-wikilink";
import { rehypeShikiLazy } from "./rehype-shiki-lazy";

// "loading" isn't in rehype-sanitize's default attribute allowlist, so this
// runs after sanitize rather than needing another schema carve-out.
function rehypeLazyImages() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName === "img") node.properties.loading = "lazy";
    });
  };
}

// Blocks that are worth scrolling to. Inline elements are left alone: the
// split view syncs at block granularity, and marking every <em> would just
// bloat the HTML.
const SOURCE_LINE_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "table",
  "tr",
  "hr",
  "img",
]);

/**
 * Stamps each block with the markdown line it came from, which is what the
 * split view's click-to-sync scrolling looks up in both directions.
 * hast-util-sanitize preserves `position`, so like rehypeLazyImages this runs
 * after sanitize instead of widening the schema — and after Shiki, so
 * highlighted code blocks (whose <pre> is swapped wholesale) keep theirs.
 */
function rehypeSourceLines() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      const line = node.position?.start.line;
      if (line && SOURCE_LINE_TAGS.has(node.tagName)) {
        node.properties.dataLine = String(line);
      }
    });
  };
}

// hast-util-sanitize only honors the FIRST matching definition it finds for
// a given property name on a tag (see findDefinition in its source) — it
// does not merge multiple `['className', ...]` entries for the same tag.
// The default schema already has one for `a` (allowing only
// 'data-footnote-backref'), so appending a second entry is silently
// unreachable. Replace it with one combined entry instead.
const defaultAnchorAttributes = defaultSchema.attributes?.a ?? [];
const sanitizeSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...defaultAnchorAttributes.filter(
        (def) => !(Array.isArray(def) && def[0] === "className"),
      ),
      ["className", "data-footnote-backref", "wikilink", "wikilink-unresolved"],
    ],
  },
};

/**
 * Sanitize runs BEFORE Shiki highlighting, not after: Shiki emits
 * style/class output that rehype-sanitize's default schema would strip,
 * silently flattening every code block back to plain text. Sanitizing the
 * user's raw markdown-derived HTML first (untrusted input), then
 * highlighting the already-sanitized tree (Shiki's own output is trusted
 * and never passes back through sanitize), keeps both intact.
 */
export async function renderMarkdown(
  bodyMd: string,
  resolve: WikilinkResolver,
): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikilink, { resolve })
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeLazyImages)
    .use(rehypeShikiLazy)
    .use(rehypeSourceLines)
    .use(rehypeStringify)
    .process(bodyMd);

  return String(file);
}
