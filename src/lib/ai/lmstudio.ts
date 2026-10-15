import "server-only";

// LM Studio's own REST API (/api/v1). Unlike its OpenAI-compatible /v1, it
// reports which models are in memory and can load or unload one.

const LIST_TIMEOUT_MS = 2500;
// A big model can take minutes to read off disk.
const LOAD_TIMEOUT_MS = 5 * 60_000;
const IDLE_UNLOAD_MS = 5 * 60_000;

export type LmStudioModel = { key: string; loaded: boolean };

function apiURL(baseURL: string, path: string): string {
  return new URL(`/api/v1/${path}`, baseURL).toString();
}

/** Every downloaded chat model, or null when the server doesn't answer. */
export async function listLmStudioModels(
  baseURL: string,
): Promise<LmStudioModel[] | null> {
  try {
    const res = await fetch(apiURL(baseURL, "models"), {
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      models?: { type: string; key: string; loaded_instances?: unknown[] }[];
    };
    if (!body.models) return null;
    return body.models
      .filter((m) => m.type === "llm")
      .map((m) => ({ key: m.key, loaded: (m.loaded_instances?.length ?? 0) > 0 }));
  } catch {
    return null;
  }
}

async function post(
  baseURL: string,
  path: string,
  body: object,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(apiURL(baseURL, path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([
        AbortSignal.timeout(LOAD_TIMEOUT_MS),
        ...(signal ? [signal] : []),
      ]),
      cache: "no-store",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Couldn't reach LM Studio. Is it running?");
  }
}

async function refusal(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `status ${res.status}`;
  } catch {
    return `status ${res.status}`;
  }
}

// The model this app loaded last. Models the user loaded themselves are never
// recorded, so they are never unloaded.
let loadedByApp: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let activeRequests = 0;
const loading = new Map<string, Promise<void>>();

async function unload(baseURL: string, model: string): Promise<void> {
  // Harmless if it's already gone.
  await post(baseURL, "models/unload", { instance_id: model }).catch(() => {});
}

// LM Studio's load endpoint takes no TTL, so the idle timeout is ours. Lost on
// a server restart; the model then stays until unloaded in LM Studio.
function armIdleUnload(baseURL: string): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const model = loadedByApp;
    loadedByApp = null;
    if (model) void unload(baseURL, model);
  }, IDLE_UNLOAD_MS);
}

async function load(
  baseURL: string,
  model: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await post(baseURL, "models/load", { model }, signal);
  if (!res.ok) {
    throw new Error(`LM Studio couldn't load ${model}: ${await refusal(res)}`);
  }
  loadedByApp = model;
}

/**
 * Makes `model` ready to answer and returns a `release` to call when the
 * request is done. Already in memory: nothing is loaded, whoever loaded it.
 * Otherwise frees the model this app loaded before (if still there) and loads
 * this one; it is unloaded after sitting idle. Whether it fits is LM Studio's
 * call — its resource guardrails refuse a load that doesn't.
 */
export async function ensureLmStudioModelLoaded(
  baseURL: string,
  model: string,
  signal?: AbortSignal,
): Promise<() => void> {
  activeRequests++;
  clearTimeout(idleTimer);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeRequests--;
    if (activeRequests === 0 && loadedByApp) armIdleUnload(baseURL);
  };

  try {
    if (loadedByApp && loadedByApp !== model) {
      await unload(baseURL, loadedByApp);
      loadedByApp = null;
    }

    const models = await listLmStudioModels(baseURL);
    if (!models?.find((m) => m.key === model)?.loaded) {
      // A second request for the same model waits on the first load.
      let pending = loading.get(model);
      if (!pending) {
        pending = load(baseURL, model, signal).finally(() =>
          loading.delete(model),
        );
        loading.set(model, pending);
      }
      await pending;
    }
  } catch (error) {
    release();
    throw error;
  }
  return release;
}
