import "server-only";
import { loadAiSettings, type StoredSettings } from "./settings-store";
import {
  PROVIDER_IDENTITIES,
  type ProviderDetail,
  type ProviderId,
  type ProviderInfo,
  type ProviderKind,
} from "./types";

// Every provider speaks the OpenAI chat-completions wire format, so generating
// is uniform: a provider is a base URL, a key and a model name. Discovery is
// per-provider — each answers "which models can you run" its own way (see the
// probes at the bottom).
//
// Config sources: base URL, model and key each have an env var; the model also
// has an [aiSettings] row that supersedes it. `getProviderConfigs` does that
// merge once. The key is only ever read from the environment.

export type { ProviderId };

export type Provider = {
  id: ProviderId;
  label: string;
  /** Somebody else's GPUs behind a key, or this machine's own — see [ProviderKind]. */
  kind: ProviderKind;
  baseURL: string;
  model: string;
  apiKey: string;
  /** The environment variable the key is read from, where one is needed. */
  keyEnv?: string;
  /** False when the provider can't be reached from where this server runs. */
  available: boolean;
  /** Two or three words for the settings page's status line — see [ProviderInfo]. */
  unavailableStatus?: string;
  /** Shown in the UI when unavailable, so the reason isn't a mystery. */
  unavailableReason?: string;
};

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

// Local model servers are on loopback, so what matters is whether this machine
// is yours, not dev vs. prod. Vercel sets VERCEL everywhere; self-hosting
// elsewhere would need its own check.
const isLocalDeployment = !process.env.VERCEL;

const LOCAL_UNAVAILABLE =
  "Local model servers are only reachable when the app runs on your own machine.";

/** Its status line, for a deployment that can't reach loopback at all. */
const LOCAL_UNAVAILABLE_STATUS = "Not reachable from here";

/**
 * Why a hosted provider with no key can't run, naming the right place to set
 * one for where the app is running (.env.local vs. the platform).
 */
function noKeyReason(keyEnv: string): string {
  return isLocalDeployment
    ? `No ${keyEnv} in .env.local — add it there and restart.`
    : `No ${keyEnv} in this deployment's environment. Add it to the project's environment variables, then redeploy.`;
}

/**
 * Static config: what each provider would be once stored settings are merged
 * over the environment. For the local two, `available` only means "reachable
 * from this machine" — the probes below settle whether a model is loaded. Not
 * exported; callers go through `listProviders`/`listProviderDetails`/
 * `resolveProvider`.
 */
function getProviderConfigs(stored: StoredSettings): Provider[] {
  // Straight from the environment — a running process reads what it started
  // with, whatever settings later change under this name.
  const geminiKey = process.env.GEMINI_API_KEY ?? "";

  return [
    {
      id: "gemini",
      ...PROVIDER_IDENTITIES.gemini,
      baseURL: GEMINI_BASE_URL,
      // The floating alias, not a pinned version — Google retires old models
      // for new keys. Only the default; settings and GEMINI_MODEL override it.
      model:
        stored.get("gemini")?.model ??
        process.env.GEMINI_MODEL ??
        "gemini-flash-latest",
      apiKey: geminiKey,
      keyEnv: "GEMINI_API_KEY",
      available: geminiKey.length > 0,
      unavailableStatus: geminiKey ? undefined : "No key",
      unavailableReason: geminiKey ? undefined : noKeyReason("GEMINI_API_KEY"),
    },
    {
      id: "lmstudio",
      ...PROVIDER_IDENTITIES.lmstudio,
      baseURL: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
      // Empty means "whatever the probe finds loaded"; a stored choice is
      // honoured only if the server still has it — see `resolveLocal`.
      model: stored.get("lmstudio")?.model ?? process.env.LMSTUDIO_MODEL ?? "",
      // Ignored by local servers, but the OpenAI client needs a non-empty string.
      apiKey: "local",
      available: isLocalDeployment,
      unavailableStatus: isLocalDeployment
        ? undefined
        : LOCAL_UNAVAILABLE_STATUS,
      unavailableReason: isLocalDeployment ? undefined : LOCAL_UNAVAILABLE,
    },
    {
      id: "ollama",
      ...PROVIDER_IDENTITIES.ollama,
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
      model: stored.get("ollama")?.model ?? process.env.OLLAMA_MODEL ?? "",
      apiKey: "local",
      available: isLocalDeployment,
      unavailableStatus: isLocalDeployment
        ? undefined
        : LOCAL_UNAVAILABLE_STATUS,
      unavailableReason: isLocalDeployment ? undefined : LOCAL_UNAVAILABLE,
    },
  ];
}

// Local servers are on loopback; this only bites when one is running but
// wedged, and it sits in front of the menu opening, so keep it short.
const PROBE_TIMEOUT_MS = 2500;

// Google is across the internet and this only runs behind the settings page,
// so it can wait longer.
const CATALOGUE_TIMEOUT_MS = 6000;

async function probeJson<T>(
  url: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: init?.headers,
      signal: AbortSignal.timeout(init?.timeoutMs ?? PROBE_TIMEOUT_MS),
      // Live state — never serve from Next's fetch cache.
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    // Refused, timed out, or not JSON — all "nothing usable there".
    return null;
  }
}

type LmStudioModel = {
  id: string;
  /** "llm" and "vlm" can chat; "embeddings" cannot. */
  type: string;
  state: "loaded" | "not-loaded";
};

/**
 * The models LM Studio currently has in memory. Uses LM Studio's own REST API,
 * not the OpenAI `/v1/models` (which lists everything downloaded, loaded or
 * not) — only its response carries a per-model `state`.
 */
async function loadedLmStudioModels(baseURL: string): Promise<string[] | null> {
  const url = new URL("/api/v0/models", baseURL).toString();
  const body = await probeJson<{ data?: LmStudioModel[] }>(url);
  if (!body?.data) return null;
  return body.data
    .filter((m) => m.state === "loaded" && m.type !== "embeddings")
    .map((m) => m.id);
}

/**
 * The models Ollama has pulled. No load-state filter — Ollama loads on demand,
 * so anything pulled is usable (the first generation is just slow).
 */
async function pulledOllamaModels(baseURL: string): Promise<string[] | null> {
  const url = `${baseURL.replace(/\/+$/, "")}/models`;
  const body = await probeJson<{ data?: { id: string }[] }>(url);
  if (!body?.data) return null;
  return body.data.map((m) => m.id);
}

/**
 * Which of Gemini's ~50 catalogue models can hold a text conversation. A
 * denylist of modalities, not an allowlist of names, so a new `gemini-4-pro`
 * shows up without a deploy — a stray model costs one failed request, a
 * missing one is a choice you can't make.
 */
const NOT_CHAT =
  /embedding|image|tts|audio|live|translate|robotics|computer-use|deep-research|customtools|veo|lyria|nano-banana|antigravity|aqa/;

function chatModels(ids: string[]): string[] {
  return ids
    .map((id) => id.replace(/^models\//, ""))
    .filter((id) => /^(gemini|gemma)-/.test(id) && !NOT_CHAT.test(id))
    .sort();
}

/**
 * Gemini's catalogue, or why it couldn't be had. Three outcomes, not
 * `string[] | null`: a rejected key means the provider can't generate either,
 * which is what makes pasting a key in settings verifiable.
 */
type Catalogue =
  | { ok: true; models: string[] }
  | { ok: false; rejected: true; error: string }
  | { ok: false; rejected: false; error: string };

/**
 * Whether a refusal is about the key, not the request. Can't be a status check
 * alone: Gemini answers a bad key with `400 INVALID_ARGUMENT`, not 401/403. So
 * 401/403 always count, 400 counts only when the message names the key, and
 * everything else (429, 5xx, timeout) is Google having a bad moment.
 */
function rejectsKey(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;
  return status === 400 && /api[ _-]?key/i.test(message);
}

/**
 * `error.message` out of a refusal, or "". Handles both shapes Gemini uses:
 * `/models` returns `{ error: { message } }`, `/chat/completions` wraps that
 * in a one-element array.
 */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    const first = Array.isArray(body) ? body[0] : body;
    return (first as { error?: { message?: string } })?.error?.message ?? "";
  } catch {
    return "";
  }
}

async function geminiCatalogue(config: Provider): Promise<Catalogue> {
  const url = new URL("models", config.baseURL).toString();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const message = await errorMessage(res);
      return rejectsKey(res.status, message)
        ? {
            ok: false,
            rejected: true,
            error: "Google rejected this key. Check it and add it again.",
          }
        : {
            ok: false,
            rejected: false,
            error: `Couldn't list models (Google answered ${res.status}).`,
          };
    }
    const body = (await res.json()) as { data?: { id: string }[] };
    return { ok: true, models: chatModels(body.data?.map((m) => m.id) ?? []) };
  } catch {
    return {
      ok: false,
      rejected: false,
      error: "Couldn't reach Google to list models.",
    };
  }
}

/**
 * Whether a hosted provider will actually generate with `model` — a real
 * 1-token completion, because the catalogue lists models a given key can't use
 * (per-key retirement, unmarked in the listing). Google's error names the
 * replacement, so it's passed through verbatim. 429 and 5xx count as `ok` —
 * don't block a local write on someone else's capacity.
 */
export async function checkModel(
  id: ProviderId,
  model: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const stored = await loadAiSettings();
  const config = getProviderConfigs(stored).find((p) => p.id === id);
  // Local providers were already verified by the probe; an unavailable one has
  // no working request to test against.
  if (!config || config.kind !== "hosted" || !config.available) {
    return { ok: true };
  }

  try {
    const res = await fetch(
      new URL("chat/completions", config.baseURL).toString(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS),
        cache: "no-store",
      },
    );
    if (res.ok || res.status === 429 || res.status >= 500) return { ok: true };
    const message = await errorMessage(res);
    return {
      ok: false,
      error: message || `${config.label} refused that model (${res.status}).`,
    };
  } catch {
    // Timed out or unreachable — the same "not the model's fault" case as a
    // 500, and the same answer.
    return { ok: true };
  }
}

// Each state in two forms: a short status line beside the Reload button, and a
// long instruction (the status line's tooltip, and what the editor's menu says
// when nothing can answer). Each ends in "reload" because the list is drawn
// once per render.
type Down = Pick<Provider, "unavailableStatus" | "unavailableReason">;

const NOT_RUNNING: Record<string, Down> = {
  lmstudio: {
    unavailableStatus: "Not running",
    unavailableReason:
      "LM Studio isn't running — start its local server, then reload.",
  },
  ollama: {
    unavailableStatus: "Not running",
    unavailableReason: "Ollama isn't running — start it, then reload.",
  },
};

const NOTHING_READY: Record<string, Down> = {
  lmstudio: {
    unavailableStatus: "No model loaded",
    unavailableReason: "No model is loaded in LM Studio — load one, then reload.",
  },
  ollama: {
    unavailableStatus: "No models pulled",
    unavailableReason: "Ollama has no models pulled — pull one, then reload.",
  },
};

/** A resolved provider and, where it was asked for, what it can run. */
type Resolution = {
  provider: Provider;
  models: string[];
  modelsError?: string;
};

/**
 * A local provider, asked what it has. One probe settles both "is it up" and
 * "what's loaded" — no cheap variant, but the answer is on loopback.
 */
async function resolveLocal(config: Provider): Promise<Resolution> {
  const models =
    config.id === "lmstudio"
      ? await loadedLmStudioModels(config.baseURL)
      : await pulledOllamaModels(config.baseURL);

  if (models === null) {
    return {
      provider: { ...config, available: false, ...NOT_RUNNING[config.id] },
      models: [],
    };
  }
  const [firstModel] = models;
  if (!firstModel) {
    return {
      provider: { ...config, available: false, ...NOTHING_READY[config.id] },
      models: [],
    };
  }
  // A chosen model wins only if the server still has it; otherwise fall back
  // to what's loaded, silently.
  const model =
    config.model && models.includes(config.model) ? config.model : firstModel;
  return { provider: { ...config, model }, models: models.sort() };
}

/** A hosted provider. Cheap unless `wantCatalogue` — key present ⇒ can run. */
async function resolveHosted(
  config: Provider,
  wantCatalogue: boolean,
): Promise<Resolution> {
  if (!wantCatalogue) return { provider: config, models: [] };

  const catalogue = await geminiCatalogue(config);
  if (!catalogue.ok) {
    return {
      provider: catalogue.rejected
        ? {
            ...config,
            available: false,
            unavailableStatus: "Key rejected",
            unavailableReason: catalogue.error,
          }
        : config,
      // Keep offering the model in force even when the catalogue is unreachable.
      models: catalogue.rejected ? [] : withCurrent([], config.model),
      modelsError: catalogue.rejected ? undefined : catalogue.error,
    };
  }
  return {
    provider: config,
    models: withCurrent(catalogue.models, config.model),
  };
}

/**
 * The catalogue, guaranteed to contain whatever is currently set — so a pinned
 * or since-retired model still appears in its own picker.
 */
function withCurrent(models: string[], current: string): string[] {
  if (!current || models.includes(current)) return models;
  return [current, ...models];
}

/**
 * Turns a config into what's true right now. `wantCatalogue` splits the two
 * callers: the editor's menu only needs "who can answer"; settings wants the
 * model list and can afford the round trip to Google.
 */
async function resolve(
  config: Provider,
  wantCatalogue: boolean,
): Promise<Resolution> {
  // Already ruled out — nothing to ask.
  if (!config.available) return { provider: config, models: [] };
  return config.kind === "hosted"
    ? resolveHosted(config, wantCatalogue)
    : resolveLocal(config);
}

/** Every provider, resolved. Backs the list the editor's menu renders. */
export async function listProviders(): Promise<Provider[]> {
  const stored = await loadAiSettings();
  const resolutions = await Promise.all(
    getProviderConfigs(stored).map((config) => resolve(config, false)),
  );
  return resolutions.map((r) => r.provider);
}

/**
 * Every provider with the models it can run — what the settings page prints.
 * Separate from `listProviders`: it costs a round trip to Google.
 */
export async function listProviderDetails(): Promise<ProviderDetail[]> {
  const stored = await loadAiSettings();
  const resolutions = await Promise.all(
    getProviderConfigs(stored).map((config) => resolve(config, true)),
  );
  return resolutions.map((r) => ({
    ...describeProvider(r.provider),
    models: r.models,
    modelsError: r.modelsError,
  }));
}

/**
 * The one provider a request will run on: the named one, or the first
 * available in list order (usually Gemini, without touching a local server).
 */
export async function resolveProvider(
  id?: ProviderId,
): Promise<Provider | undefined> {
  const stored = await loadAiSettings();
  const configs = getProviderConfigs(stored);
  if (id) {
    const config = configs.find((p) => p.id === id);
    return config ? (await resolve(config, false)).provider : undefined;
  }
  for (const config of configs) {
    const { provider } = await resolve(config, false);
    if (provider.available) return provider;
  }
  return undefined;
}

/**
 * The public face of a provider. Field by field, in one place, so `baseURL`
 * and `apiKey` can't leak by someone spreading a new [Provider] field.
 */
export function describeProvider(provider: Provider): ProviderInfo {
  return {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    model: provider.model,
    keyEnv: provider.keyEnv,
    // A boolean, not the key or any prefix of it.
    hasKey: provider.kind === "hosted" && provider.apiKey.length > 0,
    available: provider.available,
    unavailableStatus: provider.unavailableStatus,
    unavailableReason: provider.unavailableReason,
  };
}
