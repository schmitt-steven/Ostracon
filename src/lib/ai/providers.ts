import "server-only";

// Every provider here speaks the OpenAI chat-completions wire format, so a
// provider is just a base URL, a key and a model name — no per-provider
// adapters. Gemini exposes an OpenAI-compatible endpoint alongside its native
// API; LM Studio and Ollama serve one natively.
//
// If a Gemini-only feature is ever needed (thinking config, grounding), that
// swap is confined to `stream.ts` — nothing else knows which provider ran.

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

export function getProviders(): Provider[] {
  const geminiKey = process.env.GEMINI_API_KEY ?? "";

  return [
    {
      id: "gemini",
      label: "Gemini",
      baseURL: GEMINI_BASE_URL,
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      apiKey: geminiKey,
      available: geminiKey.length > 0,
      unavailableReason: geminiKey ? undefined : "GEMINI_API_KEY is not set.",
    },
    {
      id: "lmstudio",
      label: "LM Studio",
      baseURL: process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1",
      // Whatever is loaded in LM Studio answers to this — the server resolves
      // it to the currently loaded model rather than requiring the exact name.
      model: process.env.LMSTUDIO_MODEL ?? "local-model",
      // The local servers ignore the key, but the OpenAI client requires a
      // non-empty string, so this placeholder is load-bearing.
      apiKey: "local",
      available: isLocalDeployment,
      unavailableReason: isLocalDeployment ? undefined : LOCAL_UNAVAILABLE,
    },
    {
      id: "ollama",
      label: "Ollama",
      baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      model: process.env.OLLAMA_MODEL ?? "llama3.2",
      apiKey: "local",
      available: isLocalDeployment,
      unavailableReason: isLocalDeployment ? undefined : LOCAL_UNAVAILABLE,
    },
  ];
}

export function getProvider(id: ProviderId): Provider | undefined {
  return getProviders().find((p) => p.id === id);
}

/** The provider a request falls back to when the client doesn't name one. */
export function defaultProvider(): Provider | undefined {
  return getProviders().find((p) => p.available);
}
