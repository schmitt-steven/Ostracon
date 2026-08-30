// Client-safe half of the AI feature: shapes and labels both sides need. Free
// of `server-only` and SDK imports — anything the menu renders from lives here
// so the OpenAI client stays out of the browser bundle.

export const AI_ACTIONS = ["explain", "summarize", "rewrite", "ask"] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

export const ACTION_LABELS: Record<AiAction, string> = {
  explain: "Explain",
  summarize: "Summarize",
  rewrite: "Rewrite clearly",
  ask: "Ask…",
};

/**
 * Ceiling on whole-note context for a cursor-position ask — big enough for any
 * note, small enough a runaway can't burn a free tier's rate limit.
 */
export const NOTE_CONTEXT_LIMIT = 16000;

/**
 * Whose machine runs the model. Drives what "unavailable" means and what the
 * reader does about it (hosted: set a key elsewhere; local: start an app) —
 * see [StatusPill]. Ordered: hosted first, since it works from anywhere.
 */
export const PROVIDER_KINDS = ["hosted", "local"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * Every provider this build knows, in offer/fallback order. Here, not in
 * [providers], so the route, the settings actions and the settings page can
 * all validate a browser-supplied id.
 */
export const PROVIDER_IDS = ["gemini", "lmstudio", "ollama"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * The half of a provider known before anything is asked: name and kind. Here
 * so the settings page can draw the suspense placeholder from a browser
 * bundle; base URL, key and availability stay behind `server-only`. A `Record`
 * so a new id forces a name.
 */
export const PROVIDER_IDENTITIES: Record<
  ProviderId,
  { label: string; kind: ProviderKind }
> = {
  gemini: { label: "Gemini", kind: "hosted" },
  lmstudio: { label: "LM Studio", kind: "local" },
  ollama: { label: "Ollama", kind: "local" },
};

/** What `GET /api/ai` returns — never includes base URLs or keys. */
export type ProviderInfo = {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  model: string;
  /** The env var name the key is read from — never the key. Absent for local. */
  keyEnv?: string;
  /** Whether this running deployment has a key in `process.env` for it. */
  hasKey: boolean;
  available: boolean;
  /**
   * Two or three words for the pill when a provider can't run ("Not running",
   * "No key"). Set only alongside [unavailableReason], which is the fallback
   * and the tooltip.
   */
  unavailableStatus?: string;
  unavailableReason?: string;
};

/**
 * A provider plus its model list — what the settings page needs and the menu
 * doesn't. Separate because it costs a round trip to Google. See
 * [listProviderDetails].
 */
export type ProviderDetail = ProviderInfo & {
  /** Chat-capable models, including the one in force even if it isn't offered. */
  models: string[];
  /** Set when the catalogue couldn't be fetched but the provider still works. */
  modelsError?: string;
};
