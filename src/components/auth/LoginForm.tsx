"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/auth/actions";
import { formatCountdown, useCountdown } from "@/lib/ui/cooldown";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  // Keyed on the entire answer; two refusals in a row can owe the same seconds, and clock has to restart anyway
  const cooldown = useCountdown(state?.retryAfter ?? 0, state);
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
