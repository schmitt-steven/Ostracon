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
 * Marks a paragraph that holds nothing but one image — `![alt](src)` sitting on
 * its own, which is what the "opens full size" badge and the hover lift are
 * drawn for (see globals.css). They can't key off `p:has(> img:only-child)`:
 * CSS `:only-child` counts only elements, so that selector also matches
 * `text\n![](img)` — one paragraph, image glued to a line of text — and there
 * the badge, positioned from the paragraph's top, lands on the text above the
 * picture instead of on its corner. An image beside text keeps the zoom cursor
 * and the lift and goes without the badge; only a lone image gets the class.
 * Runs after sanitize, like [rehypeLazyImages] — `className` on `p` isn't in
 * the default schema.
 */
function rehypeLoneImageParagraphs() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "p") return;
      const content = node.children.filter(
        (child) => child.type !== "text" || child.value.trim() !== "",
      );
      const only = content.length === 1 ? content[0] : undefined;
      if (!only || only.type !== "element" || only.tagName !== "img") return;
      const className = node.properties.className;
      node.properties.className = Array.isArray(className)
        ? [...className, "image-block"]
        : ["image-block"];
    });
  };
}

/**
 * Paints each inline hashtag in its tag's hue. Runs after sanitise — the hue
 * is an inline `style`, which rehype-sanitize strips; setting it downstream is
 * safe since it's derived only from the resolved tag name. `--h` alone, not a
 * finished colour, so the theme's --tag-l keeps the last word.
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

// Blocks worth scrolling to — the split view syncs at block granularity.
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
 * Stamps each block with its source markdown line, for the split view's
 * click-to-sync scroll. Runs after sanitize (which keeps `position`) and after
 * Shiki (whose <pre> is swapped wholesale).
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

// hast-util-sanitize honours only the FIRST className definition it finds per
// tag — the default schema already has one for `a`, so a second is unreachable.
// This strips it so callers can replace it with one combined entry.
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
 * Sanitize runs BEFORE Shiki — sanitize the untrusted markdown-derived HTML,
 * then highlight the already-clean tree (Shiki's output is trusted and never
 * re-sanitized). The other order would strip Shiki's style/class output.
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
    // After wikilinks — a hashtag inside `[[Notes about #rust]]` must not split it.
    .use(remarkHashtag, { known: isKnownTag })
    .use(remarkAutolinkBareHost)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeHashtagHue)
    .use(rehypeLazyImages)
    .use(rehypeLoneImageParagraphs)
    .use(rehypeShikiLazy)
    .use(rehypeSourceLines)
    .use(rehypeStringify)
    .process(bodyMd);

  return String(file);
}
