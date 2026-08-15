import "server-only";
import matter from "gray-matter";

export type Frontmatter = { title: string; tags: string[] };

export function parseContentMd(contentMd: string): {
  data: Frontmatter;
  body: string;
} {
  const { data, content } = matter(contentMd);
  return {
    data: {
      title: typeof data.title === "string" ? data.title : "",
      tags: Array.isArray(data.tags) ? data.tags : [],
    },
    body: content,
  };
}

export function stringifyContentMd(data: Frontmatter, body: string): string {
  return matter.stringify(body, data);
}
