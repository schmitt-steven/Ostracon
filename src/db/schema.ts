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
    /**
     * When the note was pinned to the rail; null means it isn't.
     *
     * A timestamp rather than a boolean because the pinned section shows them
     * in the order they were pinned, and that order has to survive a reload —
     * a boolean would leave the rail sorting five equal values.
     *
     * A column rather than the localStorage the *tag* pins use (see
     * lib/tags/preferences): the rail has to print a pinned note's title, and
     * the only place a title lives is here. Client-side pins would mean either
     * shipping every note's title to the browser so five of them could be
     * looked up, or storing a copy of the title that a rename would strand.
     */
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
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
    index("notes_pinned_at_idx").on(t.pinnedAt),
  ],
);

// One row per client identity (see clientKey in lib/auth/throttle). Only the
// failure streak is stored — the cooldown itself is derived at read time, so a
// failure is a single upsert with no read-modify-write race.
export const loginAttempts = pgTable("login_attempts", {
  ip: text("ip").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Forensics for failed logins, kept separate from the throttle state above:
// that table holds live counters, this one is an append-only audit log.
// Deliberately stores no plaintext — see lib/auth/failure-log for why and for
// what each column buys you.
export const loginFailures = pgTable(
  "login_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    userAgent: text("user_agent"),
    passwordLength: integer("password_length").notNull(),
    // Keyed HMAC of the guess: equal guesses give equal fingerprints, so
    // repeats can be grouped, but the guess can't be recovered from it.
    fingerprint: text("fingerprint").notNull(),
    // Edit distance to the real password; null when the guess was too long to
    // bother comparing. Low numbers mean "this was you, typo-ing".
    distance: integer("distance"),
    // The guess itself, but only when it was far enough from the real password
    // that it can't be an owner typo. Null means "too close to write down".
    guess: text("guess"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("login_failures_attempted_at_idx").on(t.attemptedAt),
    index("login_failures_ip_idx").on(t.ip),
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
