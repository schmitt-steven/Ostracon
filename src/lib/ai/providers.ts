import "server-only";
import { loadAiSettings, type StoredSettings } from "./settings-store";
import {
  PROVIDER_IDENTITIES,
  type ProviderDetail,
  type ProviderId,
  type ProviderInfo,
  type ProviderKind,
} from "./types";

// Every provider here speaks the OpenAI chat-completions wire format, so
// *generating* is uniform — a provider is just a base URL, a key and a model
// name, with no per-provider adapters. Gemini exposes an OpenAI-compatible
// endpoint alongside its native API; LM Studio and Ollama serve one natively.
//
// If a Gemini-only generation feature is ever needed (thinking config,
// grounding), that swap is confined to `stream.ts` — nothing else knows which
// provider ran.
//
// *Discovery* is the exception, and deliberately so: which models a provider
// can actually run is live state rather than configuration, and each answers
// that question its own way — the local pair over their own REST APIs, Gemini
// over the same OpenAI-compatible endpoint it generates on. See the probes at
// the bottom of this file.
//
// **What is configured and where it comes from is this file's other job.**
// Each of the three values a provider needs — base URL, model, key — has an
// environment variable behind it, and the model also has a row in [aiSettings]
// that supersedes it. The merge happens once, in `getProviderConfigs`, so
// nothing downstream has to know a model can be configured from two places.
//
// The key is not one of those two places. It is read from the environment and
// only from the environment, here as everywhere. Nothing in this app writes a
// key: they are set on the platform that runs the deployment, which applies
// them at build time, and settings only reports whether one arrived.

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

/** Its status line, for a deployment that can't reach loopback at all. */
const LOCAL_UNAVAILABLE_STATUS = "Not reachable from here";

/**
 * Why a hosted provider with no key in this deployment's environment can't run,
 * and what to do about it.
 *
 * The instruction is half the sentence because a key is set outside this app,
 * and where "outside" is depends on where the app is running: a laptop reads
 * .env.local, a deployment reads what the platform applied to it at build time.
 * Naming the right one of the two is the difference between a reader who fixes
 * this in a minute and one who edits the file that isn't being read.
 */
function noKeyReason(keyEnv: string): string {
  return isLocalDeployment
    ? `No ${keyEnv} in .env.local — add it there and restart.`
    : `No ${keyEnv} in this deployment's environment. Add it to the project's environment variables, then redeploy.`;
}

/**
 * Static configuration only: what each provider *would* be, once the stored
 * settings have been merged over the environment. For the local two,
 * `available` is a claim rather than a fact — it means "this machine could
 * reach it at all", and whether a model is actually loaded is settled by the
 * probes below. Everything outside this module goes through `listProviders`,
 * `listProviderDetails` or `resolveProvider`, which is why this isn't exported.
 */
function getProviderConfigs(stored: StoredSettings): Provider[] {
  // Straight from the environment, with nothing layered over it. Settings can
  // change what the *project* holds under this name, but a running process
  // reads what it was started with, and pretending otherwise here would make
  // every downstream `available` a lie until the next deploy.
  const geminiKey = process.env.GEMINI_API_KEY ?? "";

  return [
    {
      id: "gemini",
      ...PROVIDER_IDENTITIES.gemini,
      baseURL: GEMINI_BASE_URL,
      // The floating alias, not a pinned version: Google retires old models
      // for new API keys, and a pin turns that into a 404 on the next request.
      // It is only the *default* now — a model chosen in settings takes
      // precedence, and so does GEMINI_MODEL on a deployment that pins one.
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
      // Empty means "whatever the probe finds loaded", which is the right
      // default for a server whose contents change while the app is running.
      // A stored choice is honoured only if that model is still there — see
      // `resolveLocal`.
      model: stored.get("lmstudio")?.model ?? process.env.LMSTUDIO_MODEL ?? "",
      // The local servers ignore the key, but the OpenAI client requires a
      // non-empty string, so this placeholder is load-bearing.
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

// Both local servers are on loopback, so a refused connection comes back at
// once and this ceiling only bites when one is running but wedged. Kept short:
// it sits in front of the menu opening.
const PROBE_TIMEOUT_MS = 2500;

// Google is across the internet rather than on loopback, and this probe only
// ever runs behind the settings page — never in front of the editor's menu —
// so it can afford to wait longer than the local pair.
const CATALOGUE_TIMEOUT_MS = 6000;

async function probeJson<T>(
  url: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: init?.headers,
      signal: AbortSignal.timeout(init?.timeoutMs ?? PROBE_TIMEOUT_MS),
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

/**
 * Which of Gemini's models can hold a text conversation.
 *
 * The catalogue is around fifty entries and most of them cannot be posted to
 * `/chat/completions` at all — embeddings, text-to-speech, image and video
 * generation, the realtime audio and robotics lines, the long-running deep
 * research models. Offering those in a picker would be offering a choice that
 * fails at the next keystroke.
 *
 * **A denylist of modalities rather than an allowlist of names**, because the
 * list changes under us. Google adds models continuously, and an allowlist
 * would quietly withhold every new one until somebody edited this file; a
 * denylist withholds only the ones whose *names* say they do something else,
 * and lets `gemini-4-pro` show up on its release day without a deploy. The
 * cost of being wrong is asymmetric in the same direction: a stray model in
 * the list is one failed request, a missing one is a choice you cannot make.
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
 * Gemini's catalogue, or why it couldn't be had.
 *
 * The three outcomes are genuinely different and the caller acts differently on
 * each, so they don't collapse into `string[] | null` the way the local probes
 * do. A rejected key means the provider cannot generate either, and is the one
 * case where failing to *list* models proves something about *running* them —
 * which is what makes adding a key from settings verifiable: paste it, and the
 * page says whether Google accepts it rather than waiting for the next
 * question you ask in the editor to fail.
 */
type Catalogue =
  | { ok: true; models: string[] }
  | { ok: false; rejected: true; error: string }
  | { ok: false; rejected: false; error: string };

/**
 * Whether a refusal is about the key rather than about the request.
 *
 * **Not a status code check, because the status lies.** The natural reading of
 * "this key is no good" is 401 or 403, and Gemini's OpenAI-compatible endpoint
 * answers a bad key with `400 INVALID_ARGUMENT — Please pass a valid API key`.
 * Keying off 401/403 alone therefore reports a wrong key as a temporary
 * listing hiccup and leaves the provider marked ready, which is precisely the
 * case this exists to catch: somebody has just pasted a key and needs to be
 * told, now, that it isn't one.
 *
 * So the status narrows and the message decides. 401 and 403 are honoured
 * because that is what a correct implementation does and other hosted
 * providers will use them; 400 counts only when the body says what it is
 * about. Anything else — a 429, a 500, a timeout — is Google having a bad
 * moment and says nothing about the key.
 */
function rejectsKey(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;
  return status === 400 && /api[ _-]?key/i.test(message);
}

/**
 * `error.message` out of a refusal, or "" if it isn't shaped like one.
 *
 * **Two shapes, because the endpoints disagree.** `/models` refuses with a
 * plain `{ error: { message } }`; `/chat/completions` refuses with that same
 * object wrapped in a one-element array. Reading only the documented shape gets
 * an empty string from the more important of the two — the one that says *this
 * model is retired, use this other one instead* — and throws away the only
 * sentence worth showing the reader.
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
 * Whether a hosted provider will actually generate with `model`.
 *
 * **The catalogue is not a promise.** Google lists models the key in hand
 * cannot use: `gemini-2.5-flash-lite` comes back from `/models` and then
 * answers a completion with `404 — no longer available to new users. Please
 * update your code to use models/gemini-3.5-flash-lite`. Retirement is per-key
 * and nothing in the listing marks it, so the only way to know is to ask.
 *
 * One token, at the moment of choosing, which is the moment worth spending it
 * at: the alternative is a picker that accepts a model and then breaks every
 * question asked in the editor afterwards, with the reason arriving somewhere
 * the setting isn't. Google's own message carries the replacement model's name,
 * so it is passed through verbatim rather than summarised.
 *
 * **A busy or broken Google is not a bad model.** 429 and the 5xx family come
 * back as `ok`, because refusing to save a preference over a rate limit would
 * be blocking a local write on somebody else's capacity.
 */
export async function checkModel(
  id: ProviderId,
  model: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const stored = await loadAiSettings();
  const config = getProviderConfigs(stored).find((p) => p.id === id);
  // Nothing to ask, or nothing to ask with. The local pair are already known
  // to hold the model — that is what the probe established — and an
  // unavailable provider has no working request to test one against.
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

// Each of these ends in a reload because this list is drawn once, when the page
// is rendered. Whether a local server is up is live state, and a reader who
// starts one *because this line told them to* has no other way of being
// believed — so the line that gives the instruction also says how to be seen
// doing it, rather than leaving them staring at a sentence that hasn't changed.
//
// Each is said twice over, short and long. The short form is the status line
// the settings page prints beside the Reload button — two or three words, so
// the state and the way out of it fit on one row. The long form is the
// instruction, which is the half a reader who has never started LM Studio
// actually needs, and it stays reachable as the status line's tooltip and as
// what the editor's menu says when nothing can answer.
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
 * A local provider, asked what it has.
 *
 * The probe settles both questions at once — whether the server is up, and
 * which models it is holding — so there is no cheap variant of this the way
 * there is for Gemini. That is fine: the answer is on loopback.
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
  // A chosen model wins, but only if the server really has it — otherwise it's
  // a stale name, from an env pin or from a model since unloaded, and the one
  // in front of us is the better answer. Silently, because the alternative is
  // refusing to generate over a preference the reader can see is unavailable
  // the moment they open settings.
  const model =
    config.model && models.includes(config.model) ? config.model : firstModel;
  return { provider: { ...config, model }, models: models.sort() };
}

/**
 * A hosted provider. Cheap unless the catalogue is asked for: with a key it can
 * run, without one it can't, and that is all the menu needs to know.
 */
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
      // The model in force is still worth offering back: the catalogue being
      // unreachable is no reason for the picker to forget what is set.
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
 * The catalogue, guaranteed to contain whatever is currently set.
 *
 * A model pinned through GEMINI_MODEL, or one chosen before Google retired it,
 * would otherwise be missing from its own picker — which reads as the setting
 * having been lost, and leaves no way to see what is actually in force.
 */
function withCurrent(models: string[], current: string): string[] {
  if (!current || models.includes(current)) return models;
  return [current, ...models];
}

/**
 * Turns a config into what's actually true right now.
 *
 * `wantCatalogue` is the difference between the two callers. The editor's menu
 * opens on a keystroke mid-sentence and only needs to know who can answer;
 * settings needs the list of models to choose from and can afford the round
 * trip to Google that gets it.
 */
async function resolve(
  config: Provider,
  wantCatalogue: boolean,
): Promise<Resolution> {
  // Already ruled out — no key, or a deployment that can't reach loopback at
  // all. No point asking, and the reason it carries is the more useful one.
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
 *
 * Separate from `listProviders` because it costs a round trip to Google that
 * the menu should never pay. See [ProviderDetail].
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
 * The one provider a request will run on. Resolves only what it has to: with
 * an id, just that one; without, it walks the list in order and stops at the
 * first that's genuinely available, which normally means Gemini is settled
 * without either local server being touched.
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
 * The public face of a provider — everything a browser is allowed to know.
 *
 * Written out field by field rather than spread-and-delete, and living here
 * rather than at each call site, because it is the one place that decides a
 * `baseURL` and an `apiKey` never cross. Three things print this list now (the
 * editor's menu over `GET /api/ai`, the settings section, and the actions that
 * hand it back after a change), and a second hand-rolled mapping is a second
 * chance to leak the key by adding a field to [Provider] and spreading it out
 * of habit.
 */
export function describeProvider(provider: Provider): ProviderInfo {
  return {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    model: provider.model,
    keyEnv: provider.keyEnv,
    // A boolean rather than the key, obviously — but also rather than any part
    // of it. A prefix would be enough to identify which key is in use and is
    // the kind of thing that ends up in a screenshot.
    hasKey: provider.kind === "hosted" && provider.apiKey.length > 0,
    available: provider.available,
    unavailableStatus: provider.unavailableStatus,
    unavailableReason: provider.unavailableReason,
  };
}
