import "server-only";

// Every provider here speaks the OpenAI chat-completions wire format, so
// *generating* is uniform — a provider is just a base URL, a key and a model
// name, with no per-provider adapters. Gemini exposes an OpenAI-compatible
// endpoint alongside its native API; LM Studio and Ollama serve one natively.
//
// If a Gemini-only generation feature is ever needed (thinking config,
// grounding), that swap is confined to `stream.ts` — nothing else knows which
// provider ran.
//
// *Discovery* is the exception, and deliberately so: the two local providers
// are only usable when something is actually loaded, which is live state, not
// configuration, and each answers that question its own way (see the probes
// at the bottom of this file).

export type ProviderId = "gemini" | "lmstudio" | "ollama";

export type Provider = {
  id: ProviderId;
  label: string;
  baseURL: string;
  model: string;
  apiKey: string;
  /** False when the provider can't be reached from where this server runs. */
  available: boolean;
  /** Shown in the UI when unavailable, so the reason isn't a mystery. */
  unavailableReason?: string;
};

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

// Local model servers listen on the loopback interface of the machine running
// this server, so what matters is whether that machine is yours — not whether
// it's running in dev mode. `next build && next start` on your own laptop
// reaches localhost:1234 exactly as `next dev` does, which is the setup for
// serving the app to a phone on the same network.
//
// Vercel sets VERCEL in every deployment, build and runtime alike. Self-hosting
// this anywhere else would need its own check here.
const isLocalDeployment = !process.env.VERCEL;

const LOCAL_UNAVAILABLE =
  "Local model servers are only reachable when the app runs on your own machine.";

/**
 * Static configuration only: what each provider *would* be. For the local two
 * this is a claim, not a fact — `available` here means "this machine could
 * reach it at all", and whether a model is actually loaded is settled by the
 * probes below. Everything outside this module goes through `listProviders`
 * or `resolveProvider` instead, which is why this isn't exported.
 */
function getProviderConfigs(): Provider[] {
  const geminiKey = process.env.GEMINI_API_KEY ?? "";

  return [
    {
      id: "gemini",
      label: "Gemini",
      baseURL: GEMINI_BASE_URL,
      // The floating alias, not a pinned version: Google retires old models
      // for new API keys, and a pin turns that into a 404 on the next request.
      model: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
      apiKey: geminiKey,
      available: geminiKey.length > 0,
      unavailableReason: geminiKey ? undefined : "GEMINI_API_KEY is not set.",
    },
    {
      id: "lmstudio",
      label: "LM Studio",
      baseURL: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
      // Left empty on purpose: the loaded model's real name comes from the
      // probe. The old "local-model" placeholder was reported to the UI as
      // though it were a model, so the menu named a model that didn't exist.
      model: process.env.LMSTUDIO_MODEL ?? "",
      // The local servers ignore the key, but the OpenAI client requires a
      // non-empty string, so this placeholder is load-bearing.
      apiKey: "local",
      available: isLocalDeployment,
      unavailableReason: isLocalDeployment ? undefined : LOCAL_UNAVAILABLE,
    },
    {
      id: "ollama",
      label: "Ollama",
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
      // As above — naming a model here would only be a guess about which ones
      // have been pulled.
      model: process.env.OLLAMA_MODEL ?? "",
      apiKey: "local",
      available: isLocalDeployment,
      unavailableReason: isLocalDeployment ? undefined : LOCAL_UNAVAILABLE,
    },
  ];
}

// Both local servers are on loopback, so a refused connection comes back at
// once and this ceiling only bites when one is running but wedged. Kept short:
// it sits in front of the menu opening.
const PROBE_TIMEOUT_MS = 2500;

async function probeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      // Whether a model is loaded changes while the app is running, so this
      // must never be served from Next's fetch cache.
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    // Refused, timed out, or answered with something that isn't JSON — all of
    // which mean the same thing to the caller: nothing usable is there.
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
 * The models LM Studio currently has in memory.
 *
 * Deliberately not the OpenAI-compatible `/v1/models`: that lists everything
 * *downloaded* — a machine with sixteen models on disk and nothing loaded
 * reports all sixteen — so probing it would call the provider ready and then
 * fail at generation time. LM Studio's own REST API, served from the same
 * port, carries a per-model `state`, which is the actual question. Requested
 * from the origin so a custom LMSTUDIO_BASE_URL path doesn't matter.
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
 * The models Ollama has pulled. No load-state filter here, and none wanted:
 * Ollama loads a model on demand at the first request, so anything pulled is
 * usable — the first generation is just slow.
 */
async function pulledOllamaModels(baseURL: string): Promise<string[] | null> {
  const url = `${baseURL.replace(/\/+$/, "")}/models`;
  const body = await probeJson<{ data?: { id: string }[] }>(url);
  if (!body?.data) return null;
  return body.data.map((m) => m.id);
}

const NOT_RUNNING: Record<string, string> = {
  lmstudio: "LM Studio isn't running — start its local server.",
  ollama: "Ollama isn't running.",
};

const NOTHING_READY: Record<string, string> = {
  lmstudio: "No model is loaded in LM Studio — load one to use it here.",
  ollama: "Ollama has no models pulled.",
};

/**
 * Turns a config into what's actually true right now. Gemini needs nothing but
 * its key, so it passes straight through; the local two are asked.
 */
async function resolve(config: Provider): Promise<Provider> {
  // Already ruled out — a deployment that can't reach loopback at all. No
  // point asking, and the reason it carries is the more useful one.
  if (config.id === "gemini" || !config.available) return config;

  const models =
    config.id === "lmstudio"
      ? await loadedLmStudioModels(config.baseURL)
      : await pulledOllamaModels(config.baseURL);

  if (models === null) {
    return {
      ...config,
      available: false,
      unavailableReason: NOT_RUNNING[config.id],
    };
  }
  const [firstModel] = models;
  if (!firstModel) {
    return {
      ...config,
      available: false,
      unavailableReason: NOTHING_READY[config.id],
    };
  }
  // An explicit env pin wins, but only if the server really has it — otherwise
  // it's a stale name, and the model in front of us is the better answer.
  const model =
    config.model && models.includes(config.model) ? config.model : firstModel;
  return { ...config, model, available: true, unavailableReason: undefined };
}

/** Every provider, resolved. Backs the list the menu renders. */
export async function listProviders(): Promise<Provider[]> {
  return Promise.all(getProviderConfigs().map(resolve));
}

/**
 * The one provider a request will run on. Resolves only what it has to: with
 * an id, just that one; without, it walks the list in order and stops at the
 * first that's genuinely available, which normally means Gemini is settled
 * without either local server being touched.
 */
export async function resolveProvider(
  id?: ProviderId,
): Promise<Provider | undefined> {
  const configs = getProviderConfigs();
  if (id) {
    const config = configs.find((p) => p.id === id);
    return config ? resolve(config) : undefined;
  }
  for (const config of configs) {
    const resolved = await resolve(config);
    if (resolved.available) return resolved;
  }
  return undefined;
}
