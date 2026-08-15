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

/** What `GET /api/ai` returns — never includes base URLs or keys. */
export type ProviderInfo = {
  id: string;
  label: string;
  model: string;
  available: boolean;
  unavailableReason?: string;
};
