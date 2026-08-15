import "server-only";
import OpenAI from "openai";
import type { Provider } from "./providers";
import type { AiAction } from "./types";

// Output lands directly in a markdown note, so the model is told to write
// note-shaped prose: no chat preamble, no restating of the selection, no
// fenced wrapper around the whole answer (which would break the note's own
// formatting once inserted).
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
  selection: string;
  /** Only used by the "ask" action. */
  question?: string;
  /** Gives the model a little context about where the selection came from. */
  noteTitle?: string;
};

function buildUserPrompt({
  action,
  selection,
  question,
  noteTitle,
}: CompletionRequest): string {
  const instruction =
    action === "ask"
      ? (question?.trim() ?? "")
      : INSTRUCTIONS[action];

  // The selection is fenced off in a tag rather than quoted inline so that a
  // selection which itself contains backticks or markdown headings can't be
  // read as part of the instruction.
  return [
    noteTitle ? `The selection is from a note titled "${noteTitle}".` : null,
    "<selection>",
    selection,
    "</selection>",
    "",
    instruction,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Streams the model's answer as plain text chunks. Throws before yielding
 * anything if the provider rejects the request, so the caller can turn that
 * into an HTTP error rather than a half-written stream.
 */
export async function* streamCompletion(
  provider: Provider,
  request: CompletionRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    // Local servers are on loopback and a stalled request should surface
    // quickly rather than hanging the editor; the browser can always retry.
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
