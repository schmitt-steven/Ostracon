import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { defaultProvider, getProvider, getProviders } from "@/lib/ai/providers";
import { streamCompletion } from "@/lib/ai/stream";
import { AI_ACTIONS, type ProviderInfo } from "@/lib/ai/types";

// Lets the menu render the real provider list — which ones exist, which are
// reachable from this deployment, and why not. Deliberately maps the fields by
// hand rather than spreading: baseURL and apiKey stay server-side.
export async function GET(): Promise<NextResponse<ProviderInfo[]>> {
  await requireAuth();
  return NextResponse.json(
    getProviders().map((p) => ({
      id: p.id,
      label: p.label,
      model: p.model,
      available: p.available,
      unavailableReason: p.unavailableReason,
    })),
  );
}

// A Route Handler rather than a Server Action: the response is a token stream,
// and Server Actions return a single value. Like the search-corpus route, this
// is outside the Server Action auth convention, so requireAuth() here is
// load-bearing — it guards both the notes' content and the API key's spend.
const RequestSchema = z.object({
  providerId: z.enum(["gemini", "lmstudio", "ollama"]).optional(),
  action: z.enum(AI_ACTIONS),
  // Bounded so a stray select-all can't send an entire long note (and burn
  // the free tier's rate limit) on one keystroke.
  selection: z.string().min(1).max(8000),
  question: z.string().max(1000).optional(),
  noteTitle: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  await requireAuth();

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { providerId, action, selection, question, noteTitle } = parsed.data;

  if (action === "ask" && !question?.trim()) {
    return NextResponse.json({ error: "Ask what?" }, { status: 400 });
  }

  const provider = providerId ? getProvider(providerId) : defaultProvider();
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
    { action, selection, question, noteTitle },
    request.signal,
  );
  let first;
  try {
    first = await tokens.next();
  } catch (error) {
    // "Connection error." is what the SDK gives for an unreachable host, which
    // for a local provider almost always means the app isn't running — worth
    // saying, since that's a fix the user can act on.
    const raw =
      error instanceof Error ? error.message : "The model request failed";
    const message =
      raw === "Connection error."
        ? `Couldn't reach ${provider.label}. Is it running?`
        : raw;
    return NextResponse.json({ error: message }, { status: 502 });
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
