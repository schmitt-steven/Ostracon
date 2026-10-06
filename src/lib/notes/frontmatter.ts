import "server-only";
import matter from "gray-matter";
import { DayKey, parseDayKey } from "./daily";

/** What a note's frontmatter carries. `tags` is the note's own tag record. */
export type Frontmatter = { title: string; tags: string[] };

export type ParsedFrontmatter = {
  title: string;
  /**
   * `null` = no tag record (a pre-frontmatter note); `[]` = been through the
   * tag bar, carries none. Only [resolveNoteTags] tells them apart.
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
 * The frontmatter an exported file carries — more than a stored one. `created`,
 * `updated`, `slug` and `pinned` exist only in the archive (a save would make
 * them stale copies of columns); they're carried so a restore keeps the
 * collection's shape, not just its text. `slug`/`pinned` are omitted when
 * empty. Dates are ISO strings, not YAML timestamps, to avoid the local/UTC
 * ambiguity.
 */
export type ExportFrontmatter = {
  title: string;
  tags: string[];
  slug: string;
  created: string;
  updated: string;
  pinned?: string;
  journalEntryDate?: string;
};

export function stringifyExportMd(
  data: ExportFrontmatter,
  body: string,
): string {
  return matter.stringify(body, data);
}

// The cheap half of the YAML-anchor-bomb defence — refuse an absurd header
// before parsing it. The shape check in [readArchiveFrontmatter] is the rest.
const MAX_FRONTMATTER_BYTES = 16 * 1024;

export type ArchiveFrontmatter = {
  title: string | null;
  tags: string[] | null;
  slug: string | null;
  created: Date | null;
  updated: Date | null;
  pinned: Date | null;
  journalEntryDate: DayKey | null;
};

const EMPTY_ARCHIVE_FRONTMATTER: ArchiveFrontmatter = {
  title: null,
  tags: null,
  slug: null,
  created: null,
  updated: null,
  pinned: null,
  journalEntryDate: null,
};

/**
 * A date from a file, or null. Clamped to `now` on the future side — a note
 * dated 2099 would pin itself to the top of the index forever. The past is
 * left alone.
 */
function readDate(value: unknown, now: Date): Date | null {
  // gray-matter resolves unquoted timestamps to Date, quoted to string.
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
 * The fields an archived note can declare, validated down to scalars;
 * everything else is discarded. Returns all nulls when there's no frontmatter,
 * it's too large, or the YAML doesn't parse.
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
    // Pin the engine to YAML: a `---toml` fence throws, same as malformed YAML.
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
      journalEntryDate: readDay(raw.journalEntryDate),
    },
    body: parsed.content,
  };
}

/** A `YYYY-MM-DD` day from a file, or null — whether YAML left it a string or
 * resolved it to a Date. */
function readDay(value: unknown): DayKey | null {
  if (typeof value === "string") return parseDayKey(value);
  // YAML reads a bare date as UTC midnight, so the UTC day is the written one.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10) as DayKey;
  }
  return null;
}
