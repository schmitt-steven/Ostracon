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

// One row per successful login — that is, per device that holds a valid
// cookie. The cookie names its row by id and proves it with an HMAC, so this
// table is not what makes a token *authentic*; it's what makes a token
// *current*. Without it a signed cookie is valid until it ages out, which
// leaves no way to sign one device out, and nothing to show when asking which
// devices are signed in.
//
// See lib/auth/session-store for the operations, and lib/auth/session for what
// the cookie itself carries.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * When this session stops being accepted regardless of anything else.
     *
     * Duplicates the age check the token already carries, on purpose: it lets
     * a session be listed or pruned without minting or parsing a token, and it
     * means shortening SESSION_MAX_AGE_SECONDS doesn't retroactively strand
     * rows whose real deadline was set under the old value.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /**
     * Set when the session is signed out — from this device or another one.
     * A row rather than a delete so a future UI can show what was revoked and
     * when; pruneSessions sweeps them once that's no longer interesting.
     */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /**
     * Captured once, at login. This is the pair that identifies the *device*
     * ("Safari on iPhone"), so it has to stay fixed — overwriting it as the
     * session travels would turn the only stable label into a moving one.
     */
    createdIp: text("created_ip"),
    createdUserAgent: text("created_user_agent"),
    /**
     * Updated as the session is used, throttled to keep an ordinary page view
     * from costing a write. The address is here rather than above because a
     * change in it is the interesting signal — same device, new network, or
     * else a cookie that has travelled.
     */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenIp: text("last_seen_ip"),
    /** A name the owner gives the device later; null until they do. */
    label: text("label"),
  },
  (t) => [
    // Covers the "which sessions are live" listing, newest first.
    index("sessions_last_seen_at_idx").on(t.lastSeenAt),
    // Prunes read by deadline.
    index("sessions_expires_at_idx").on(t.expiresAt),
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
