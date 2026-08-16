import "server-only";
import type { Element, ElementContent, Root } from "hast";
import { bundledLanguages, getSingletonHighlighter } from "shiki";
import { visit } from "unist-util-visit";

// Dual output, one render. Notes are highlighted on the server (and cached by
// whatever rendered them), so the HTML can't know which theme the reader is
// in — instead every token carries both colours and the CSS in globals.css
// picks one. `defaultColor: "light"` writes the light colour inline as a plain
// `color:`, so light-theme output is exactly what a single-theme render gives;
// dark rides along in `--shiki-dark`.
//
// Both are Rose Pine: dawn's muted blue/gold tokens sit in the same family as
// the app's ink and accent, and moon is that same palette on a deep ground.
const THEMES = { light: "rose-pine-dawn", dark: "rose-pine-moon" } as const;

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
