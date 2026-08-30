"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { checkModel, listProviderDetails } from "./providers";
import { setStoredModel } from "./settings-store";
import { PROVIDER_IDS, type ProviderDetail } from "./types";

/**
 * The settings page's one write: a provider's model, to this app's database
 * (lib/ai/settings-store). Keys are never written from here — they're
 * environment variables. Returns the freshly resolved provider list, which is
 * both the result and the page's state update (no [refresh] needed).
 */

export type AiSettingsResult =
  { ok: true; providers: ProviderDetail[] } | { ok: false; error: string };

// Validated, not trusted — a Server Action is a public endpoint, and this is a
// primary key.
const providerId = z.enum(PROVIDER_IDS);

/**
 * A model name as the providers spell them (`gemini-3.5-flash`, `qwen/qwen3-8b`,
 * `llama3.2:3b`). Bounded and alphabet-restricted; not checked against the
 * catalogue, since the picker took it from there already.
 */
const ModelInput = z.object({
  providerId,
  model: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._:/-]+$/, "That isn't a model name.")
    .nullable(),
});

export async function setProviderModelAction(
  input: unknown,
): Promise<AiSettingsResult> {
  await requireAuth();

  const parsed = ModelInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Couldn't read that." };
  const { providerId: id, model } = parsed.data;

  // Checked before it's stored — a listed model isn't necessarily usable (see
  // [checkModel]).
  if (model !== null) {
    const usable = await checkModel(id, model);
    if (!usable.ok) return { ok: false, error: usable.error };
  }

  await setStoredModel(id, model);
  return { ok: true, providers: await listProviderDetails() };
}
