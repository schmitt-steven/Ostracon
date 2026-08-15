"use client";

import { useCallback, useRef, useState } from "react";
import type { AiAction } from "@/lib/ai/types";

export type AiRequest = {
  providerId?: string;
  action: AiAction;
  selection: string;
  question?: string;
  noteTitle?: string;
};

type Args = {
  /** Called for each chunk as it arrives, in order. */
  onToken: (text: string) => void;
  /** Called once the stream ends, successfully or not. */
  onDone: (result: { ok: boolean; error?: string }) => void;
};

export function useAiCompletion({ onToken, onDone }: Args) {
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Kept in refs so `run` stays referentially stable across renders — it's
  // called from a menu that unmounts as soon as generation starts.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const run = useCallback(async (request: AiRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        // Errors are JSON, successes are a text stream — only parse on the
        // error path, and don't let a non-JSON body (an auth redirect to the
        // login page, say) throw over the real problem.
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        onDoneRef.current({
          ok: false,
          error: body?.error ?? `Request failed (${res.status})`,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // stream: true so a multi-byte character split across two network
        // chunks is held until it's complete rather than emitted as U+FFFD.
        const text = decoder.decode(value, { stream: true });
        if (text) onTokenRef.current(text);
      }
      onDoneRef.current({ ok: true });
    } catch (error) {
      if (controller.signal.aborted) {
        // Deliberate cancel — the caller already knows.
        onDoneRef.current({ ok: false });
      } else {
        onDoneRef.current({
          ok: false,
          error: error instanceof Error ? error.message : "Request failed",
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, []);

  return { run, cancel, streaming };
}
