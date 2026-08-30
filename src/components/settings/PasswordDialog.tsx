"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  changePasswordAction,
  type ChangePasswordResult,
} from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { formatCountdown, useCountdown } from "@/lib/ui/cooldown";

type Props = { onClose: () => void };

/**
 * Changing the password: three fields and one warning. The current password is
 * required (the server enforces it — [changePasswordAction] — through the
 * login throttle, hence the cooldown). The confirm field catches a mistyped
 * password before the next sign-in. The dialog stays open on success so the
 * "signed out N devices" count can be read.
 */
export function PasswordDialog({ onClose }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<ChangePasswordResult | null>(null);
  const [pending, startTransition] = useTransition();

  const failure = result && !result.ok ? result : null;
  const done = result?.ok ? result : null;

  const cooldown = useCountdown(failure?.retryAfter ?? 0, result);
  const locked = cooldown > 0;

  const shortId = useId();
  const mismatchId = useId();

  // Long enough and typed twice the same; whether it's really a change is the
  // server's to say.
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready =
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LENGTH &&
    confirm === next &&
    !pending &&
    !locked;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Captured, so the view underneath doesn't also act on the same press.
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  function submit() {
    if (!ready) return;
    startTransition(async () => {
      try {
        setResult(await changePasswordAction({ current, next }));
      } catch {
        setResult({
          ok: false,
          error: "Couldn't change the password. Nothing was changed.",
        });
      }
    });
  }

  // Into <body>, like the tag dialogs — `.pane > *` sets `position`, so a
  // dialog inside a pane would lay out in flow.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Change password"
      className="scrim fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="glass lift-3 w-full max-w-md rounded-[var(--radius-zone)] p-6">
        {done ? (
          <>
            <p className="text-base text-ink">Password changed.</p>
            <p className="mt-1 text-[13px] text-ink-muted">
              {done.signedOut === 0
                ? "This is the only device signed in, so nothing else had to be signed out."
                : `Signed out ${done.signedOut} other ${
                    done.signedOut === 1 ? "device" : "devices"
                  }. This one stays signed in.`}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={onClose}
                className="row-tint row-selected rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-ink">Change password</p>
            {/* Said before the press, since it's the unexpected part. */}
            <p className="mt-1 text-[13px] text-ink-muted">
              Your other devices will be signed out. This one stays signed in.
            </p>

            {/* A real form with autocomplete tokens, so a password manager
                offers to update its entry. */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              className="mt-4 flex flex-col gap-3"
            >
              <Field
                label="Current password"
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
                disabled={locked}
                autoFocus
              />
              <Field
                label="New password"
                value={next}
                onChange={setNext}
                autoComplete="new-password"
                disabled={locked}
                describedBy={tooShort ? shortId : undefined}
                // Under its own field — a rule being explained as it's broken.
                note={
                  tooShort ? (
                    <span id={shortId} className="text-[12px] text-ink-faint">
                      At least {MIN_PASSWORD_LENGTH} characters.
                    </span>
                  ) : null
                }
              />
              <Field
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                disabled={locked}
                describedBy={mismatch ? mismatchId : undefined}
                note={
                  mismatch ? (
                    <span id={mismatchId} className="text-[12px] text-accent">
                      These don&apos;t match.
                    </span>
                  ) : null
                }
              />

              {/* --danger: this says the press didn't take. */}
              {failure && (
                <p role="alert" className="text-[13px] text-danger">
                  {failure.error}
                  {locked && ` Try again in ${formatCountdown(cooldown)}.`}
                </p>
              )}

              {/* Cancel first, confirm at the right end — every dialog's order. */}
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!ready}
                  // Seated only while it can be pressed.
                  className={`row-tint rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] ${
                    ready ? "row-selected text-ink" : "text-ink-faint"
                  }`}
                >
                  {pending ? "Changing…" : "Change password"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One labelled password box — a real `<label>` above it, not a placeholder. */
function Field({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  autoFocus,
  note,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  disabled?: boolean;
  autoFocus?: boolean;
  /** A quieter line under the field — a rule, or why it isn't accepted yet. */
  note?: ReactNode;
  describedBy?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-muted">{label}</span>
      {/* `.well` is the field's edge — same construction as the tag rename field. */}
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="well w-full rounded-[var(--radius-control)] bg-sunk px-3 py-2 text-base text-ink outline-none focus-visible:outline-none! disabled:opacity-50"
      />
      {note}
    </label>
  );
}
