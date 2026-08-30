// Client-safe half of the AI feature: the shapes and labels both sides need.
//
// Deliberately free of `server-only` and of any SDK import. `stream.ts` pulls
// in the OpenAI client and must never reach the browser, so anything the menu
// renders from has to live here instead — importing a single label from a
// server-only module drags the whole SDK into the client bundle and fails the
// build.

export const AI_ACTIONS = ["explain", "summarize", "rewrite", "ask"] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

export const ACTION_LABELS: Record<AiAction, string> = {
  explain: "Explain",
  summarize: "Summarize",
  rewrite: "Rewrite clearly",
  ask: "Ask…",
};

/**
 * Ceiling on whole-note context for a cursor-position ask. Long enough for any
 * note in a personal knowledge base, low enough that a runaway one can't spend
 * a free tier's rate limit in a couple of questions.
 */
export const NOTE_CONTEXT_LIMIT = 16000;

/**
 * Whose machine runs the model.
 *
 * The one division worth drawing between providers, and it is not a technical
 * one — every provider here speaks the same wire format. It is about what
 * being unavailable *means*, and therefore about what the reader does next: a
 * hosted provider is missing a key, which is set somewhere else and is worth an
 * instruction; a local one isn't running, which is fixed by opening an app on
 * the desk in front of you and needs none. Settings colours the status pill and
 * decides whether to print a sentence under it from exactly this — see
 * [StatusPill].
 *
 * It used to be two group headings and a word at the end of every name line,
 * both of which said "Hosted" and "On this machine" over and over. One sentence
 * at the top of the section says it once, so the labels those needed are gone.
 *
 * Ordered, because the array is what the settings page prints in order and
 * hosted comes first for the same reason it does in [getProviderConfigs] —
 * it's the one that works from anywhere.
 */
export const PROVIDER_KINDS = ["hosted", "local"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * Every provider this build knows how to talk to, in the order they are offered
 * and fallen back through.
 *
 * Here rather than in [providers] because three places need to validate an id
 * arriving from a browser — the generation route, the settings actions, and the
 * settings page — and only this file can be imported by all of them.
 */
export const PROVIDER_IDS = ["gemini", "lmstudio", "ollama"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * The half of a provider that is true before anything is asked: what it is
 * called, and whose machine it runs on.
 *
 * Split out of [getProviderConfigs] and put here because the settings page has
 * to draw a provider *before* the server has resolved one. The section is
 * suspended on three network probes, and its placeholder is the same list of
 * names with the answers missing — which it can only be if the names are
 * readable from a browser bundle. Everything else about a provider (its base
 * URL, its key, whether it can answer) stays behind `server-only`, where it
 * belongs.
 *
 * A `Record` keyed by [ProviderId] rather than a list, so a fourth provider
 * cannot be added to the ids above without the compiler asking what it is
 * called.
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
  /**
   * The environment variable this provider's key is read from — the *name*,
   * never the key. Absent for the local pair, which need none. Settings names
   * it so a reader knows which variable to go and set on the platform.
   */
  keyEnv?: string;
  /** Whether this running deployment has a key in `process.env` for it. */
  hasKey: boolean;
  available: boolean;
  /**
   * Two or three words for the pill beside a provider's name when it can't run
   * — "Not running", "No model loaded", "No key".
   *
   * The short form exists because it is read at a glance, next to the name,
   * and a pill is as wide as its words. It is only ever set where
   * [unavailableReason] is, and the long form stays the fallback for a state
   * with nothing short to say — and the tooltip, so the instruction is one
   * hover away wherever the pill stands alone.
   */
  unavailableStatus?: string;
  unavailableReason?: string;
};

/**
 * A provider plus everything the settings page needs and the editor's menu
 * does not.
 *
 * A separate type because it is a separate cost. Listing Gemini's models is a
 * round trip to Google, while the menu opens on a keystroke in the middle of
 * writing; it wants to know *whether* a provider can answer, not everything it
 * could answer with. See [listProviderDetails].
 */
export type ProviderDetail = ProviderInfo & {
  /** Chat-capable models, including the one in force even if it isn't offered. */
  models: string[];
  /** Set when the catalogue couldn't be fetched but the provider still works. */
  modelsError?: string;
};
