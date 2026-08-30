import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  describeProvider,
  listProviders,
  resolveProvider,
} from "@/lib/ai/providers";
import { describeCompletionError, streamCompletion } from "@/lib/ai/stream";
import {
  AI_ACTIONS,
  NOTE_CONTEXT_LIMIT,
  PROVIDER_IDS,
  type ProviderInfo,
} from "@/lib/ai/types";

// The provider list for the menu; [describeProvider] keeps baseURL and apiKey
// server-side.
export async function GET(): Promise<NextResponse<ProviderInfo[]>> {
  await requireAuth();
  return NextResponse.json((await listProviders()).map(describeProvider));
}

// A Route Handler, not a Server Action — the response is a token stream.
// Outside the Server Action auth convention, so requireAuth() here is
// load-bearing.
const RequestSchema = z.object({
  providerId: z.enum(PROVIDER_IDS).optional(),
  action: z.enum(AI_ACTIONS),
  // Bounded so a select-all can't burn the rate limit on one keystroke.
  selection: z.string().max(8000).optional(),
  question: z.string().max(1000).optional(),
  noteBody: z.string().max(NOTE_CONTEXT_LIMIT).optional(),
  noteTitle: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  await requireAuth();

  const parsed = RequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { providerId, action, selection, question, noteBody, noteTitle } =
    parsed.data;

  if (action === "ask" && !question?.trim()) {
    return NextResponse.json({ error: "Ask what?" }, { status: 400 });
  }
  // Only "ask" can fall back to whole-note context.
  if (action !== "ask" && !selection?.trim()) {
    return NextResponse.json(
      { error: "Select some text first" },
      { status: 400 },
    );
  }

  const provider = await resolveProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (!provider.available) {
    return NextResponse.json(
      { error: provider.unavailableReason ?? "Provider unavailable" },
      { status: 503 },
    );
  }

  // Pulled before the Response is built, so an early failure is a JSON error,
  // not an empty 200.
  const tokens = streamCompletion(
    provider,
    { action, selection, question, noteBody, noteTitle },
    request.signal,
  );
  let first;
  try {
    first = await tokens.next();
  } catch (error) {
    // 502 — this route's gateway hop; the upstream status is in the message.
    return NextResponse.json(
      { error: describeCompletionError(error, provider.label) },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for await (const token of tokens) {
          controller.enqueue(encoder.encode(token));
        }
      } catch {
        // Mid-stream failure — close cleanly; can't signal a fault after a 200.
      } finally {
        controller.close();
      }
    },
    cancel() {
      // The reader went away (Escape) — stop generating.
      void tokens.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
