import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    contentMd: text("content_md").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("notes_slug_idx").on(t.slug),
    index("notes_tags_gin_idx").using("gin", t.tags),
    index("notes_updated_at_idx").on(t.updatedAt),
  ],
);

export const links = pgTable(
  "links",
  {
    fromId: uuid("from_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("links_from_to_idx").on(t.fromId, t.toId),
    index("links_to_id_idx").on(t.toId),
  ],
);
