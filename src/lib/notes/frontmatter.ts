import "server-only";
import matter from "gray-matter";

/** What a note's frontmatter carries. `tags` is the note's own tag record. */
export type Frontmatter = { title: string; tags: string[] };

export type ParsedFrontmatter = {
  title: string;
  /**
   * `null` when the note has no tag record at all — written before tags moved
   * out of the body. An empty array is a different statement: this note has
   * been through the tag bar and carries no tags. See [resolveNoteTags], which
   * is the only place allowed to tell those two apart.
   */
  tags: string[] | null;
};

export function parseContentMd(contentMd: string): {
  data: ParsedFrontmatter;
  body: string;
} {
  const { data, content } = matter(contentMd);
  return {
    data: {
      title: typeof data.title === "string" ? data.title : "",
      tags: Array.isArray(data.tags) ? data.tags.map(String) : null,
    },
    body: content,
  };
}

export function stringifyContentMd(data: Frontmatter, body: string): string {
  return matter.stringify(body, data);
}
