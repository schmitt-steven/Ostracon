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

/**
 * The frontmatter an *exported* file carries, which is more than a stored one.
 *
 * **These keys exist only in the archive.** Every save rewrites a note's
 * frontmatter from `{title, tags}` (see [stringifyContentMd]), so a `created:`
 * living in `content_md` would be a copy of a column — correct on the day it
 * was written and stale from the next keystroke onward. The columns stay the
 * record; the export enriches on the way out and the import reads back on the
 * way in, and neither leaves anything behind for a save to contradict.
 *
 * Why they are worth carrying at all: a restore without dates is a collection
 * where everything was created the day it was restored. The index sorts by
 * `updated`, the rail counts by it, and the day-titles of untitled notes are
 * anchored to `created` — a backup that loses all three gives back the text and
 * none of the shape.
 *
 * `slug` is here so URLs survive a restore into an empty collection; `pinned`
 * so the rail comes back the way it was left. Both are omitted when there is
 * nothing to say, which is what keeps the common file down to four lines.
 *
 * Dates are ISO strings rather than YAML timestamps, deliberately. A bare
 * `2026-03-04 09:12:44` in YAML is parsed as local time by some readers and as
 * UTC by others, and a backup is exactly the wrong place to find that out.
 */
export type ExportFrontmatter = {
  title: string;
  tags: string[];
  slug: string;
  created: string;
  updated: string;
  pinned?: string;
};

export function stringifyExportMd(
  data: ExportFrontmatter,
  body: string,
): string {
  return matter.stringify(body, data);
}

/**
 * How much of a file may be frontmatter before it stops being frontmatter.
 *
 * The parser is YAML, and YAML is a language with anchors — a small document
 * can expand into a very large object, which is a denial of service against
 * whatever holds the result. This is not a defence against that on its own; the
 * shape check in [readArchiveFrontmatter] is, because it keeps six scalars and
 * discards the rest. It is the cheap half: sixteen kilobytes is already an
 * absurd header for a note, and refusing past it means the expensive half is
 * never asked to run on something enormous.
 */
const MAX_FRONTMATTER_BYTES = 16 * 1024;

export type ArchiveFrontmatter = {
  title: string | null;
  tags: string[] | null;
  slug: string | null;
  created: Date | null;
  updated: Date | null;
  pinned: Date | null;
};

const EMPTY_ARCHIVE_FRONTMATTER: ArchiveFrontmatter = {
  title: null,
  tags: null,
  slug: null,
  created: null,
  updated: null,
  pinned: null,
};

/**
 * A date from a file, or null.
 *
 * Clamped forward as well as parsed. A note claiming to have been updated in
 * 2099 sits at the top of the index forever and cannot be dislodged by writing
 * anything, which makes a hand-edited — or hostile — archive a way to pin
 * content permanently. The far past is left alone: a note dated 1993 is
 * someone's imported journal, and it sorts to the bottom where it belongs.
 */
function readDate(value: unknown, now: Date): Date | null {
  // gray-matter's YAML engine resolves unquoted timestamps to Date objects and
  // quoted ones to strings, and this has to take either.
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date > now ? now : date;
}

/**
 * The six fields an archived note may declare, validated down to scalars.
 *
 * Everything else in the block is discarded rather than repaired — this is
 * reading a file that arrived from outside, and the safe shape of that is a
 * fixed set of fields with fixed types, not an object graph that gets passed
 * along to see what happens.
 *
 * Returns nulls throughout when the file has no frontmatter, when it is too
 * large to be one, or when the YAML doesn't parse. All three mean the same
 * thing to the caller: this file has no record about itself, read it as prose.
 */
export function readArchiveFrontmatter(
  text: string,
  now: Date = new Date(),
): { data: ArchiveFrontmatter; body: string } {
  if (!text.startsWith("---")) {
    return { data: EMPTY_ARCHIVE_FRONTMATTER, body: text };
  }
  // The closing fence, looked for before the parser is handed anything.
  const close = text.indexOf("\n---", 3);
  if (close === -1 || close > MAX_FRONTMATTER_BYTES) {
    return { data: EMPTY_ARCHIVE_FRONTMATTER, body: text };
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    // `language` pins the default engine to YAML. A file that names another
    // one after the fence (`---toml`) reaches an unregistered parser and
    // throws, which is the same outcome as malformed YAML and handled here.
    parsed = matter(text, { language: "yaml" });
  } catch {
    return { data: EMPTY_ARCHIVE_FRONTMATTER, body: text };
  }

  const raw = parsed.data as Record<string, unknown>;
  return {
    data: {
      title: typeof raw.title === "string" ? raw.title : null,
      tags: Array.isArray(raw.tags)
        ? raw.tags.filter((tag): tag is string => typeof tag === "string")
        : null,
      slug: typeof raw.slug === "string" ? raw.slug : null,
      created: readDate(raw.created, now),
      updated: readDate(raw.updated, now),
      pinned: readDate(raw.pinned, now),
    },
    body: parsed.content,
  };
}
