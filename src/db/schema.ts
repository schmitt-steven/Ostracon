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
     * When the note was pinned to the sidebar; null means it isn't. A
     * timestamp, not a boolean, so the pinned section keeps its order across a
     * reload. A column, not localStorage like tag pins, because the sidebar
     * needs the title and that only lives here.
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
 * The password the app is unlocked with, once its owner has changed it. At
 * most one row, fixed id (upsert with no prior read). No row means
 * APP_PASSWORD from the environment is still in force. Only the scrypt hash is
 * kept — see lib/auth/password.
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
 * Which model each AI provider generates with. Like [appPassword]/APP_PASSWORD:
 * a row supersedes the environment variable, no row means the variable stands
 * (see lib/ai/providers for the merge). One row per provider, keyed by its id.
 * API keys are never here — a key is a credential, and this DB is widely
 * exposed; keys stay environment variables.
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

// One row per successful login. The HMAC-signed cookie is what makes a token
// authentic; this table is what makes it *current* — without it there's no way
// to revoke a device or list which are signed in. See lib/auth/session-store
// and lib/auth/session.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * The session's hard deadline. Duplicates the token's age check so a
     * session can be listed or pruned without a token, and so shortening
     * SESSION_MAX_AGE_SECONDS doesn't strand existing rows.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set on sign-out. A row, not a delete, so a future UI can show it;
     * pruneSessions sweeps it later. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Captured once at login — the pair that names the device. Never
     * overwritten. */
    createdIp: text("created_ip"),
    createdUserAgent: text("created_user_agent"),
    /** Where that address was, as the platform's edge reported it — stored, not
     * re-derived (see lib/auth/geo). Null off the platform. */
    createdLocation: text("created_location"),
    /**
     * Updated as the session is used, write-throttled. The address is tracked
     * here because a change in it is the interesting signal.
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
