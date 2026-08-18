import "server-only";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Link, PhrasingContent, Root } from "mdast";

/**
 * Autolinks bare hosts — `google.com`, `docs.rs/tokio`.
 *
 * remark-gfm already autolinks anything with a scheme and anything starting
 * `www.`, and stops there. That left the app linking `https://google.com` and
 * `www.google.com` but not `google.com`, which isn't a rule anyone can hold in
 * their head while writing — it just looks like the linker is unreliable. One
 * rule now: a host is a host.
 *
 * The risk in the other direction is real and is why this is a closed list of
 * suffixes rather than a general `\w+\.\w+` pattern. In a knowledge base about
 * software, `package.json`, `next.js`, `tsconfig.json` and `e.g.` all look
 * exactly like bare hosts, and turning any of them into a link would be worse
 * than the inconsistency this fixes. Add to the list when something real is
 * missed; never widen it to "any two-to-four letters".
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
    // …and optionally a path, query or fragment. Trailing sentence
    // punctuation is excluded so "see google.com." doesn't swallow the stop.
    String.raw`(?:\/[^\s<>()]*[^\s<>().,;:!?'"])?` +
    // Not followed by more of a hostname. The `\.[a-z]` half is what makes
    // `foo.co.uk` match whole instead of stopping at `foo.co`; a bare `\.`
    // there would also reject the full stop at the end of a sentence, which
    // silently dropped the path from "see docs.rs/tokio." — the trailing `.`
    // failed the lookahead and the match backtracked to the bare host.
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
          // `replace(...match, matchObject)` — the whole match, then each
          // capture group, then the position. This pattern has one group, so
          // that's three parameters even though the group and the full match
          // are the same text.
          (
            _match: string,
            host: string,
            match: { index: number; input: string },
          ): PhrasingContent | false => {
            // Guards against matching the tail of something already spelled
            // out: the `docs.rs` inside `https://docs.rs/x` (whose text node
            // this isn't, but a hand-written `<https://…>` can leave one), an
            // email's domain, or a path segment.
            const before =
              match.index === 0 ? "" : match.input[match.index - 1] ?? "";
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
      // Never inside something that is already a link, or the replacement
      // would nest one anchor in another.
      { ignore: ["link", "linkReference", "definition"] },
    );
  };
}
