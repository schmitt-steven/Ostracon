"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/auth/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium uppercase tracking-[0.14em] text-ink-muted">
        Password
        <input
          type="password"
          name="password"
          autoFocus
          required
          className="rounded-lg border border-line bg-paper px-4 py-3 text-base font-normal normal-case tracking-normal text-ink outline-none transition-colors focus:border-blue"
        />
      </label>
      {state?.error && (
        <p className="rounded-lg bg-accent-wash px-4 py-2.5 text-base text-accent-hover">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue px-4 py-3 text-base font-medium text-paper transition-colors hover:bg-blue-hover disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
