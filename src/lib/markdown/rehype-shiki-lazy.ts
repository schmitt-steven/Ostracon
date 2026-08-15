import "server-only";
import type { Element, ElementContent, Root } from "hast";
import { bundledLanguages, getSingletonHighlighter } from "shiki";
import { visit } from "unist-util-visit";

// Single theme — the app committed to one warm light palette (see globals.css),
// so the previous dual light/dark output (which required --shiki-* custom
// properties on every token) is no longer needed. rose-pine-dawn's muted
// blue/gold tokens sit in the same family as the app's ink and accent.
const THEME = "rose-pine-dawn";

function languageFromClassName(className: unknown): string | null {
  if (!Array.isArray(className)) return null;
  for (const entry of className) {
    if (typeof entry === "string" && entry.startsWith("language-")) {
      return entry.slice("language-".length);
    }
  }
  return null;
}

function textContent(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if ("children" in node) return node.children.map(textContent).join("");
  return "";
}

type Target = {
  parent: Element | Root;
  index: number;
  code: string;
  lang: string;
  // Shiki builds a fresh <pre> with no position of its own; carrying the
  // original's over keeps rehypeSourceLines able to stamp code blocks.
  position: Element["position"];
};

/**
 * Highlights fenced code blocks via Shiki, requesting only the languages
 * actually present in this note (module-level singleton highlighter caches
 * previously-loaded languages across requests/notes within the same warm
 * server instance). Must run AFTER sanitize, not before — see MarkdownView
 * for why.
 */
export function rehypeShikiLazy() {
  return async function transformer(tree: Root) {
    const targets: Target[] = [];

    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const codeNode = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!codeNode) return;
      const requested = languageFromClassName(codeNode.properties.className);
      const lang = requested && requested in bundledLanguages ? requested : "text";
      targets.push({
        parent,
        index,
        code: textContent(codeNode),
        lang,
        position: node.position,
      });
    });

    if (targets.length === 0) return;

    const langs = [...new Set(targets.map((t) => t.lang))];
    const highlighter = await getSingletonHighlighter({
      themes: [THEME],
      langs,
    });

    for (const target of targets) {
      const highlighted = await highlighter.codeToHast(target.code, {
        lang: target.lang,
        theme: THEME,
      });
      const newPre = highlighted.children[0];
      if (newPre && newPre.type === "element") {
        newPre.position = target.position;
        target.parent.children[target.index] = newPre;
      }
    }
  };
}
