import "server-only";
import { db } from "@/db/client";
import { aiSettings } from "@/db/schema";
import type { ProviderId } from "./types";

/**
 * Reads and writes of [aiSettings] — the rows that supersede GEMINI_MODEL and
 * its local counterparts. Models only, never keys. [getProviderConfigs]
 * decides whether the row or the env var wins.
 */

export type StoredSettings = Map<string, { model: string | null }>;

/** Every provider's row in one query — the caller always wants all of them. */
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
