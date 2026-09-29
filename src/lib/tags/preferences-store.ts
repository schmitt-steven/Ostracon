import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tagPreferences } from "@/db/schema";
import {
  EMPTY_TAG_PREFERENCES,
  normalizeTagPreferences,
  type TagPreferences,
} from "./preferences-shape";

/**
 * Reads and writes of [tagPreferences] — the pinned tags, the hue overrides,
 * and the order both pinned sidebar sections sit in.
 *
 * One row holds all three, so the id is a constant rather than anything the
 * caller supplies. Nothing here is per-device: that is the point of the table.
 */

const ROW_ID = "default";

/** No row yet means nothing has been pinned — an empty set, not an error. */
export async function loadTagPreferences(): Promise<TagPreferences> {
  const [row] = await db
    .select({
      pinned: tagPreferences.pinned,
      hues: tagPreferences.hues,
      order: tagPreferences.order,
    })
    .from(tagPreferences)
    .where(eq(tagPreferences.id, ROW_ID))
    .limit(1);

  // Normalized on the way out too: the row could have been written by an older
  // build with a different palette (see normalizeTagPreferences).
  return row ? normalizeTagPreferences(row) : EMPTY_TAG_PREFERENCES;
}

/** Replaces all three lists at once — the store commits whole snapshots. */
export async function saveTagPreferences(
  preferences: TagPreferences,
): Promise<void> {
  const { pinned, hues, order } = preferences;
  const updatedAt = new Date();
  await db
    .insert(tagPreferences)
    .values({ id: ROW_ID, pinned, hues, order, updatedAt })
    .onConflictDoUpdate({
      target: tagPreferences.id,
      set: { pinned, hues, order, updatedAt },
    });
}
