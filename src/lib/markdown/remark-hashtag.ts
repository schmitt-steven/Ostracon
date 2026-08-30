import "server-only";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Link, PhrasingContent, Root, Emphasis } from "mdast";
import { normalizeTag } from "@/lib/tags/parse";
import { tagHref } from "@/lib/tags/routes";

/**
 * `#word` / `#parent/child` become links to the tag's index, when the tag
 * exists — a hashtag is a reference, not filing (see lib/tags/parse). An
 * unknown `#name` renders as muted text. Same shape as [remarkWikilink]; the
 * hue is applied later, in [rehypeHashtagHue], after sanitise. The character
 * class is kept in step with lib/tags/parse by hand.
 */
const HASHTAG_RE = /#([\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*)/gu;

export type TagResolver = (name: string) => boolean;

export function remarkHashtag(options: { known: TagResolver }) {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        [
          HASHTAG_RE,
          (
            _match: string,
            rawName: string,
            match: { index: number; input: string },
          ): PhrasingContent | false => {
            // A `#` only opens a tag at the start or after whitespace (the
            // indexer's rule) — keeps `example.com/#anchor` from becoming a tag.
            const before =
              match.index === 0 ? "" : (match.input[match.index - 1] ?? "");
            if (before !== "" && !/\s/.test(before)) return false;

            const name = normalizeTag(rawName);
            // Label keeps the user's capitalisation; only the identity is normalised.
            const label = { type: "text" as const, value: `#${rawName}` };

            if (!options.known(name)) {
              // An emphasis with an hName override — mdast's way to reach an
              // arbitrary element without a custom node type.
              const unresolved: Emphasis = {
                type: "emphasis",
                children: [label],
                data: {
                  hName: "span",
                  hProperties: { className: ["hashtag-unresolved"] },
                },
              };
              return unresolved;
            }

            const link: Link = {
              type: "link",
              url: tagHref(name),
              children: [label],
              data: { hProperties: { className: ["hashtag"] } },
            };
            return link;
          },
        ],
      ],
      // A hashtag inside link text would otherwise become a link inside a link.
      { ignore: ["link", "linkReference", "definition"] },
    );
  };
}
