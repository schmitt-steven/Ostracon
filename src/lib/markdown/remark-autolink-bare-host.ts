import "server-only";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Link, PhrasingContent, Root } from "mdast";

/**
 * Autolinks bare hosts — `google.com`, `docs.rs/tokio` — which remark-gfm
 * doesn't (it needs a scheme or `www.`). A closed suffix list, not a general
 * `\w+\.\w+`, so `package.json`, `next.js` and `e.g.` don't become links. Add
 * a suffix when something real is missed; never widen the pattern.
 */
const SUFFIXES = [
  "com",
  "org",
  "net",
  "io",
  "dev",
  "ai",
  "co",
  "app",
  "sh",
  "rs",
  "me",
  "xyz",
  "edu",
  "gov",
  "info",
  "blog",
  "page",
  "tech",
  "uk",
  "de",
  "eu",
];

const BARE_HOST_RE = new RegExp(
  String.raw`\b(` +
    // One or more labels, then a suffix from the list above…
    String.raw`(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${SUFFIXES.join("|")})` +
    // …then an optional path, minus trailing sentence punctuation.
    String.raw`(?:\/[^\s<>()]*[^\s<>().,;:!?'"])?` +
    // Not followed by more hostname. `\.[a-z]` (not bare `\.`) so `foo.co.uk`
    // matches whole without rejecting a sentence-ending full stop.
    String.raw`)(?![\w-]|\.[a-z])`,
  "gi",
);

export function remarkAutolinkBareHost() {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        [
          BARE_HOST_RE,
          (
            _match: string,
            host: string,
            match: { index: number; input: string },
          ): PhrasingContent | false => {
            // Don't match the tail of an already-spelled-out URL, an email
            // domain, or a path segment.
            const before =
              match.index === 0 ? "" : (match.input[match.index - 1] ?? "");
            if (before && /[@/\w.-]/.test(before)) return false;

            const link: Link = {
              type: "link",
              url: `https://${host}`,
              children: [{ type: "text", value: host }],
            };
            return link;
          },
        ],
      ],
      // Not inside an existing link — that would nest anchors.
      { ignore: ["link", "linkReference", "definition"] },
    );
  };
}
