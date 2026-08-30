"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { checkModel, listProviderDetails } from "./providers";
import { setStoredModel } from "./settings-store";
import { PROVIDER_IDS, type ProviderDetail } from "./types";

/**
 * The settings page's one write: a provider's model, to this app's database
 * (lib/ai/settings-store). A model is a preference and belongs where the app's
 * other preferences are.
 *
 * **Keys are not written from here, and that is the whole design.** An API key
 * is an environment variable, set on the platform that runs the deployment and
 * applied at build time. An app that wrote them for you would need a platform
 * token — a strictly more powerful credential — to save something that still
 * wouldn't take effect until a redeploy, which is more steps than the dashboard
 * it was meant to replace. Settings reports whether a key arrived; setting one
 * happens where every other environment variable is set.
 *
 * **It hands back the whole provider list.** Not as a convenience — as the way
 * the result is reported. Storing a model is only half an answer; the other
 * half is what the provider now looks like, and that is a question only a fresh
 * resolve can settle.
 *
 * It also removes the need for [refresh]. The page's own server render produced
 * the list the browser is holding; replacing that list *is* the update, and
 * re-running the route would drag the blob-store walk in Deployment along with
 * it for a change that section knows nothing about.
 */

export type AiSettingsResult =
  { ok: true; providers: ProviderDetail[] } | { ok: false; error: string };

// Ids are validated against the list rather than trusted, for the reason every
// Server Action in this app validates its input: it is a public endpoint
// whatever the UI in front of it looks like, and this one is a primary key.
const providerId = z.enum(PROVIDER_IDS);

/**
 * A model name as the three providers actually spell them —
 * `gemini-3.5-flash`, `qwen/qwen3-8b`, `llama3.2:3b`. Bounded and restricted to
 * that alphabet so nothing surprising reaches a URL path or a JSON body later;
 * not checked against the catalogue, because doing so would mean a second round
 * trip to Google to police a value the picker took from Google in the first
 * place.
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

  // Asked before it is stored, because a listed model is not necessarily a
  // usable one — see [checkModel]. Refusing here means the reader learns it
  // from the control they just used, with Google's own suggestion of what to
  // pick instead, rather than from the next question they ask in the editor.
  if (model !== null) {
    const usable = await checkModel(id, model);
    if (!usable.ok) return { ok: false, error: usable.error };
  }

  await setStoredModel(id, model);
  return { ok: true, providers: await listProviderDetails() };
}
