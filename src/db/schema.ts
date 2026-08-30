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

/**
 * The password the app is unlocked with, once its owner has changed it.
 *
 * At most one row, always under the same id — a fixed key rather than a serial
 * so setting the password is a single upsert with nothing to read first, and so
 * a second row is impossible rather than merely unexpected.
 *
 * Its absence is meaningful: with no row, the password is still APP_PASSWORD
 * from the environment, which is what a fresh deployment starts with and what
 * the settings page reports as "never changed". Only what is *derived* from a
 * password is kept here — see lib/auth/password for the scrypt parameters and
 * why the plaintext deliberately stops being available once this row exists.
 */
export const appPassword = pgTable("app_password", {
  id: text("id").primaryKey(),
  /** `scrypt$N$r$p$salt$key`, hex — self-describing so old rows keep verifying
   *  after the cost parameters are raised. */
  hash: text("hash").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Which model each AI provider should generate with.
 *
 * The same arrangement [appPassword] has with APP_PASSWORD: the model starts
 * life as an environment variable set by hand on the platform, which means it
 * cannot be changed from inside the app — and a model you cannot change is a
 * model you are stuck with. A row here supersedes the variable; no row means
 * the variable is still in force. See lib/ai/providers for the merge.
 *
 * One row per provider, keyed by the provider's own id rather than a serial,
 * so setting a model is a single upsert with nothing to read first — and so a
 * provider cannot end up with two rows disagreeing about it.
 *
 * **API keys are deliberately not here.** A model name is a preference; a key
 * is a credential that bills its owner, and this database is held by the build,
 * by drizzle-kit, by the Neon console and by every backup ever taken of it.
 * Keys stay environment variables, set on the platform, which is what that
 * store is for — settings reports whether one is present and nothing more.
 */
export const aiSettings = pgTable("ai_settings", {
  providerId: text("provider_id").primaryKey(),
  /** The model to generate with, or null to keep taking the environment's. */
  model: text("model"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
     * Where that address was, in place names, as the platform's edge reported
     * it at the time — `Frankfurt, Germany`. Stored rather than derived on
     * read, because an address is only evidence of a location on the day it
     * was seen; see lib/auth/geo. Null off the platform, where there is no
     * such header and the address itself is all there is to show.
     */
    createdLocation: text("created_location"),
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
    /** The travelling half of the pair above, kept for the same reason. */
    lastSeenLocation: text("last_seen_location"),
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
