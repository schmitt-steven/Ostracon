import "server-only";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";
import type { Provider } from "./providers";
import type { AiAction } from "./types";

// Output lands directly in a markdown note, so the model is told to write
// note-shaped prose — no chat preamble, no fenced wrapper around the answer.
const SYSTEM_PROMPT = `You are a writing assistant embedded in a personal software-engineering knowledge base. The user selects text in a note and asks you about it, and your answer is inserted into that note as markdown.

Write the answer only. No preamble, no sign-off, no restating the question, and no "Here is..." opener. Do not wrap the whole response in a code fence — use fences only for actual code. Match the note's voice: direct, technical, no filler. Prefer a short paragraph over a bulleted list unless the content is genuinely a list.`;

const INSTRUCTIONS: Record<Exclude<AiAction, "ask">, string> = {
  explain:
    "Explain the selected text. Focus on what is non-obvious about it; assume the reader is a working software engineer.",
  summarize:
    "Summarize the selected text in a few sentences, keeping the specific technical details rather than generalizing them away.",
  rewrite:
    "Rewrite the selected text to be clearer and tighter, preserving every technical fact and its markdown formatting.",
};

export type CompletionRequest = {
  action: AiAction;
  /** Empty for an ask raised at the bare cursor. */
  selection?: string;
  /** Only used by the "ask" action. */
  question?: string;
  /** Whole-note context, sent only when there's no selection to focus on. */
  noteBody?: string;
  /** Gives the model a little context about where this came from. */
  noteTitle?: string;
};

function buildUserPrompt({
  action,
  selection,
  question,
  noteBody,
  noteTitle,
}: CompletionRequest): string {
  const instruction =
    action === "ask" ? (question?.trim() ?? "") : INSTRUCTIONS[action];

  // Fenced in a tag, not quoted inline, so its own markup can't read as
  // instructions.
  const context = selection
    ? ["<selection>", selection, "</selection>"]
    : noteBody
      ? ["<note>", noteBody, "</note>"]
      : [];

  const preamble = selection
    ? noteTitle
      ? `The selection is from a note titled "${noteTitle}".`
      : null
    : noteBody
      ? `Below is the user's note${noteTitle ? ` titled "${noteTitle}"` : ""}. Answer their question; draw on the note where it's relevant and say so plainly when it isn't.`
      : null;

  return [preamble, ...context, "", instruction]
    .filter((line) => line !== null)
    .join("\n");
}

// The SDK reads its error message from `{"error":{"message":...}}`; Gemini
// wraps that in a JSON array, so its explanation is lost. Unwrapping it here,
// the one place that touches the wire, keeps `APIError.message` working.
async function fetchUnwrappingErrors(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.ok) return response;

  const body = await response.text();
  let unwrapped = body;
  try {
    const parsed: unknown = JSON.parse(body);
    if (Array.isArray(parsed) && parsed.length > 0) {
      unwrapped = JSON.stringify(parsed[0]);
    }
  } catch {
    // Not JSON (an HTML proxy error page, say) — passed through as-is.
  }

  // These describe the original bytes, which have been rewritten.
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(unwrapped, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Reduces whatever the SDK threw to one actionable line for the user.
 */
export function describeCompletionError(
  error: unknown,
  providerLabel: string,
): string {
  if (error instanceof APIConnectionTimeoutError) {
    return `${providerLabel} didn't respond in time.`;
  }
  if (error instanceof APIConnectionError) {
    // Unreachable host — for a local provider, usually "not running".
    return `Couldn't reach ${providerLabel}. Is it running?`;
  }
  if (error instanceof APIError) {
    // `message` already leads with the status code.
    return `${providerLabel}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "The model request failed.";
}

/**
 * Streams the model's answer as text chunks. Throws before the first yield if
 * the provider rejects the request, so the caller can send an HTTP error.
 */
export async function* streamCompletion(
  provider: Provider,
  request: CompletionRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    fetch: fetchUnwrappingErrors,
    // A stalled request should surface rather than hang the editor.
    timeout: 60_000,
    maxRetries: 1,
  });

  const stream = await client.chat.completions.create(
    {
      model: provider.model,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(request) },
      ],
    },
    { signal },
  );

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
