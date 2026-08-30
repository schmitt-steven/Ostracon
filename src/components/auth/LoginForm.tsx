"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/auth/actions";
import { formatCountdown, useCountdown } from "@/lib/ui/cooldown";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  // Keyed on the whole answer — two refusals can owe the same seconds.
  const cooldown = useCountdown(state?.retryAfter ?? 0, state);
  const locked = cooldown > 0;

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex w-full flex-col gap-1.5">
        <span className="text-[13px] text-ink-muted">Password</span>
        {/* `.well` is the field's edge — same as the password-change fields. */}
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          disabled={locked}
          spellCheck={false}
          className="well w-full rounded-[var(--radius-control)] bg-sunk px-3 py-2 text-base text-ink outline-none focus-visible:outline-none! disabled:opacity-50"
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
