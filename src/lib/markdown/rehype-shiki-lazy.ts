import "server-only";
import type { Element, ElementContent, Root } from "hast";
import { bundledLanguages, getSingletonHighlighter } from "shiki";
import { visit } from "unist-util-visit";

// Dual output: server-rendered HTML can't know the reader's theme, so every
// token carries both colours (light inline, dark in `--shiki-dark`) and the
// CSS picks one.
// Not Rose Pine Dawn: globals.css drops each theme's own background for
// --sunk, which in light mode is darker than dawn's cream, and dawn's already
// weak tokens fell under 3:1 there. One Light survives the swap.
const THEMES = { light: "one-light", dark: "rose-pine-moon" } as const;

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
  // Carried onto Shiki's fresh <pre> so rehypeSourceLines can still stamp it.
  position: Element["position"];
};

/**
 * Highlights fenced code blocks via Shiki, loading only the languages present
 * in this note (the singleton highlighter caches them across notes on a warm
 * instance). Must run AFTER sanitize — see MarkdownView.
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
      const lang =
        requested && requested in bundledLanguages ? requested : "text";
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
      themes: [THEMES.light, THEMES.dark],
      langs,
    });

    for (const target of targets) {
      const highlighted = await highlighter.codeToHast(target.code, {
        lang: target.lang,
        themes: THEMES,
        defaultColor: "light",
      });
      const newPre = highlighted.children[0];
      if (newPre && newPre.type === "element") {
        newPre.position = target.position;
        target.parent.children[target.index] = newPre;
      }
    }
  };
}
