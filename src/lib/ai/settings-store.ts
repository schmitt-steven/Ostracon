import "server-only";
import { db } from "@/db/client";
import { aiSettings } from "@/db/schema";
import type { ProviderId } from "./types";

/**
 * Reads and writes of [aiSettings] — the rows that supersede GEMINI_MODEL and
 * its local counterparts.
 *
 * Models only. Keys are not in this database and never pass through this file;
 * they are environment variables set on the platform, and nothing in the app
 * writes them. Nothing here decides whether the row or the variable wins
 * either — that is [getProviderConfigs], the only place that should know.
 */

export type StoredSettings = Map<string, { model: string | null }>;

/**
 * Every provider's row, in one query.
 *
 * One query rather than one per provider because the caller always wants all
 * of them — the settings page lists them, and even resolving a single provider
 * for one request is cheaper as a three-row scan of a tiny table than as a
 * round trip that has to be repeated the moment a second provider is asked
 * about.
 */
export async function loadAiSettings(): Promise<StoredSettings> {
  const rows = await db
    .select({ providerId: aiSettings.providerId, model: aiSettings.model })
    .from(aiSettings);

  return new Map(rows.map((row) => [row.providerId, { model: row.model }]));
}

/** Sets the model for one provider, or clears it back to the environment's. */
export async function setStoredModel(
  providerId: ProviderId,
  model: string | null,
): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(aiSettings)
    .values({ providerId, model, updatedAt })
    .onConflictDoUpdate({
      target: aiSettings.providerId,
      set: { model, updatedAt },
    });
}
