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

// Lets the menu render the real provider list — which ones exist, which are
// usable right now, and why not. [describeProvider] is what keeps baseURL and
// apiKey server-side; nothing is narrowed here beyond what it hands back.
export async function GET(): Promise<NextResponse<ProviderInfo[]>> {
  await requireAuth();
  return NextResponse.json((await listProviders()).map(describeProvider));
}

// A Route Handler rather than a Server Action: the response is a token stream,
// and Server Actions return a single value. Like the search-corpus route, this
// is outside the Server Action auth convention, so requireAuth() here is
// load-bearing — it guards both the notes' content and the API key's spend.
const RequestSchema = z.object({
  providerId: z.enum(PROVIDER_IDS).optional(),
  action: z.enum(AI_ACTIONS),
  // Bounded so a stray select-all can't send an entire long note (and burn
  // the free tier's rate limit) on one keystroke. Optional because "ask" can
  // be raised at the bare cursor, where the note stands in as context.
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
  // Explain/summarize/rewrite are all "do this to that" — without a selection
  // there is no "that", and only ask can fall back to whole-note context.
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

  // Started before the Response is constructed so an auth/quota/connection
  // failure becomes a JSON error the UI can show, rather than a 200 whose
  // body turns out to be empty.
  const tokens = streamCompletion(
    provider,
    { action, selection, question, noteBody, noteTitle },
    request.signal,
  );
  let first;
  try {
    first = await tokens.next();
  } catch (error) {
    // 502 rather than the upstream's own status: the failure is this route's
    // gateway hop, and forwarding a 404 would read as "no such endpoint" to the
    // client. The upstream status travels in the message instead.
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
        // Mid-stream failure: the user keeps the partial answer already in
        // their note. Closing cleanly beats erroring, since there's no way to
        // signal a fault once a 200 body has started.
      } finally {
        controller.close();
      }
    },
    cancel() {
      // The reader went away (user hit Escape) — stop generating.
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
