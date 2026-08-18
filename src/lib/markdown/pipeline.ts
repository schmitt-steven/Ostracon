import "server-only";
import type { Root } from "hast";
import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { tagHue } from "@/lib/tags/hue";
import { tagFromSegments } from "@/lib/tags/routes";
import { remarkAutolinkBareHost } from "./remark-autolink-bare-host";
import { remarkHashtag, type TagResolver } from "./remark-hashtag";
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

/**
 * Paints each inline hashtag in its tag's hue.
 *
 * Runs after sanitising, for the same reason rehypeLazyImages does: the hue is
 * carried as an inline `style`, and rehype-sanitize strips `style` outright
 * rather than trying to parse it. Widening the schema to admit style
 * attributes on the user's own markdown would be a real hole; setting the
 * attribute downstream of the sanitiser is not, because nothing here is
 * derived from the document's text — only from the tag name the link already
 * resolved to.
 *
 * `--h` alone, rather than a finished colour: the two themes light tags at
 * different lightness (see --tag-l), so the CSS has to keep the last word.
 */
function rehypeHashtagHue() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a") return;
      const className = node.properties.className;
      if (!Array.isArray(className) || !className.includes("hashtag")) return;

      const href = node.properties.href;
      if (typeof href !== "string" || !href.startsWith("/t/")) return;
      const name = tagFromSegments(href.slice(3).split("/"));
      node.properties.style = `--h:${tagHue(name)}`;
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
function withoutClassName(defs: NonNullable<Options["attributes"]>[string]) {
  return defs.filter((def) => !(Array.isArray(def) && def[0] === "className"));
}

const sanitizeSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...withoutClassName(defaultSchema.attributes?.a ?? []),
      [
        "className",
        "data-footnote-backref",
        "wikilink",
        "wikilink-unresolved",
        "hashtag",
      ],
    ],
    // A `#name` that matches no existing tag (see remarkHashtag).
    span: [
      ...withoutClassName(defaultSchema.attributes?.span ?? []),
      ["className", "hashtag-unresolved"],
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
export type RenderOptions = {
  /** A wikilink's title → the slug it points at, or undefined if unresolved. */
  resolveWikilink: WikilinkResolver;
  /** Whether a `#name` names a tag that exists. Unknown ones aren't links. */
  isKnownTag: TagResolver;
};

export async function renderMarkdown(
  bodyMd: string,
  { resolveWikilink, isKnownTag }: RenderOptions,
): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikilink, { resolve: resolveWikilink })
    // After wikilinks: `[[Notes about #rust]]` is one wikilink, and a hashtag
    // rule running first would have cut a link node out of the middle of it.
    .use(remarkHashtag, { known: isKnownTag })
    .use(remarkAutolinkBareHost)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeHashtagHue)
    .use(rehypeLazyImages)
    .use(rehypeShikiLazy)
    .use(rehypeSourceLines)
    .use(rehypeStringify)
    .process(bodyMd);

  return String(file);
}
