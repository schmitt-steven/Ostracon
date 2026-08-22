"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction, type LoginState } from "@/lib/auth/actions";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Ticks the server-issued cooldown down to zero. Seeded during render rather
 * than in an effect so the first paint after a locked-out submit already shows
 * the full duration.
 */
function useCooldown(state: LoginState): number {
  const [remaining, setRemaining] = useState(state?.retryAfter ?? 0);
  const [seenState, setSeenState] = useState(state);

  if (state !== seenState) {
    setSeenState(state);
    setRemaining(state?.retryAfter ?? 0);
  }

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return remaining;
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const cooldown = useCooldown(state);
  const locked = cooldown > 0;

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium uppercase tracking-[0.14em] text-ink-muted">
        Password
        <input
          type="password"
          name="password"
          autoFocus
          required
          disabled={locked}
          className="well rounded-[var(--radius-control)] bg-sunk px-4 py-3 text-base font-normal normal-case tracking-normal text-ink outline-none transition-colors focus:bg-action-wash disabled:opacity-50"
        />
      </label>
      {state?.error && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] bg-accent-wash px-4 py-2.5 text-base text-accent-hover"
        >
          {state.error}
          {locked && ` Try again in ${formatCountdown(cooldown)}.`}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || locked}
        className="rounded-[var(--radius-control)] bg-action px-4 py-3 text-base font-medium text-paper transition-colors hover:bg-action-hover disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
