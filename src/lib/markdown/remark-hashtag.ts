import "server-only";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Link, PhrasingContent, Root, Emphasis } from "mdast";
import { normalizeTag } from "@/lib/tags/parse";
import { tagHref } from "@/lib/tags/routes";

/**
 * `#word` and `#parent/child` become links to the tag's index — when that tag
 * exists.
 *
 * A hashtag in the body is a *reference*, not an act of filing: tags are
 * created in the tag bar above the editor and nowhere else (see lib/tags/parse
 * for why). So this resolves against the tags in use exactly the way
 * [remarkWikilink] resolves a title against the notes table. A `#name` that
 * matches nothing renders as muted text rather than a link — there is no index
 * behind it to send anyone to.
 *
 * Deliberately the same shape as [remarkWikilink] next door — both turn a
 * piece of plain syntax into a link and leave everything else to the pipeline.
 * The hue is *not* applied here: it's an inline style, and rehype-sanitize
 * would strip it. See [rehypeHashtagHue], which runs after sanitising.
 *
 * The character class is kept in step with lib/tags/parse by hand rather than
 * shared, because that one scans raw text with its own offset bookkeeping and
 * this one runs inside mdast, where code spans have already been separated out
 * as their own nodes and never reach a text node here.
 */
const HASHTAG_RE = /#([\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*)/gu;

export type TagResolver = (name: string) => boolean;

export function remarkHashtag(options: { known: TagResolver }) {
  return (tree: Root) => {
    findAndReplace(tree, [
      [
        HASHTAG_RE,
        (
          _match: string,
          rawName: string,
          match: { index: number; input: string },
        ): PhrasingContent | false => {
          // Same rule the indexer uses: a `#` only opens a tag at the start of
          // the text or after whitespace. Returning false leaves the text
          // exactly as written, which is what keeps `example.com/#anchor` and
          // `[jump](#section)` from turning into tags.
          const before =
            match.index === 0 ? "" : match.input[match.index - 1] ?? "";
          if (before !== "" && !/\s/.test(before)) return false;

          const name = normalizeTag(rawName);
          // The label keeps the user's own capitalisation in both branches;
          // only the identity behind it is normalised.
          const label = { type: "text" as const, value: `#${rawName}` };

          if (!options.known(name)) {
            // No node type in mdast means "styled inline span", so this is an
            // emphasis carrying an hName override — the standard way to reach
            // an arbitrary element from mdast, and cheaper than teaching the
            // rest of the pipeline a custom node type for one muted span.
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
    { ignore: ["link", "linkReference", "definition"] });
  };
}
