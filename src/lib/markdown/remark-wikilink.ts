import "server-only";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Link, PhrasingContent, Root } from "mdast";

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export type WikilinkResolver = (title: string) => string | undefined;

export function remarkWikilink(options: { resolve: WikilinkResolver }) {
  return (tree: Root) => {
    findAndReplace(tree, [
      [
        WIKILINK_RE,
        (_match: string, rawTitle: string, rawAlias: string | undefined): PhrasingContent => {
          const title = rawTitle.trim();
          const label = (rawAlias ?? title).trim();
          const slug = options.resolve(title);

          const link: Link = {
            type: "link",
            url: slug
              ? `/notes/${slug}`
              : `/notes/new?title=${encodeURIComponent(title)}`,
            children: [{ type: "text", value: label }],
            data: {
              hProperties: {
                className: slug ? ["wikilink"] : ["wikilink", "wikilink-unresolved"],
              },
            },
          };
          return link;
        },
      ],
    ]);
  };
}
