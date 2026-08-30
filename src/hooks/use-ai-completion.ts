"use client";

import { useCallback, useRef, useState } from "react";
import type { AiAction } from "@/lib/ai/types";

export type AiRequest = {
  providerId?: string;
  action: AiAction;
  /** Absent for a question raised at the bare cursor. */
  selection?: string;
  question?: string;
  /** Whole-note context, sent only when there's no selection. */
  noteBody?: string;
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

  // In refs so `run` stays stable — the menu that calls it unmounts at once.
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
        // Errors are JSON; tolerate a non-JSON body (an auth redirect).
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
        // stream: true holds a multi-byte char split across chunks.
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
