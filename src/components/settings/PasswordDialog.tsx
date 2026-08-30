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
 * Changing the password, which is three fields and one warning.
 *
 * **The current password is asked for even though you are already signed in.**
 * The session is a month-old cookie on a machine that may have been left
 * unlocked; the password is the thing its owner knows. Of everything reachable
 * from an open tab, this is the action that would lock the real owner out, so
 * it is the one worth proving yourself for. The server enforces it — see
 * [changePasswordAction] — and puts a failed attempt through the same throttle
 * a failed sign-in goes through, which is why this dialog can be told to wait.
 *
 * **The confirmation field is not ceremony.** Every character in the other two
 * is a dot, and a password typed once and stored wrong is one you discover at
 * the next sign-in, from the other side of the door. Typing it twice is the
 * only check available when nothing can be read back.
 *
 * The dialog does not close itself on success. The change signs the other
 * devices out, and how many is a fact the reader gets exactly one chance to
 * see; a dialog that vanished on its own would take the answer with it.
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

  // Long enough, typed twice the same, and actually a change of something —
  // whether it is a change of the *password* is the server's to say, since only
  // it knows the current one.
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

  // Into <body>, as the tag dialogs are: `fixed` is a utility and `.pane > *`
  // sets `position` on its children unlayered, so a dialog rendered inside a
  // pane would lay out in flow rather than over the viewport.
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
            {/* Said before the press, not discovered after it. Signing the
                other devices out is the point of changing a password — a
                change that left every existing cookie working for another
                month would be a change in name only — but it is also the part
                nobody expects, and the part that has consequences on a phone
                in another room. */}
            <p className="mt-1 text-[13px] text-ink-muted">
              Your other devices will be signed out. This one stays signed in.
            </p>

            {/* A real form, so a password manager sees three fields it
                recognises and offers to update the entry it already has.
                `current-password` then `new-password` twice is the exact shape
                they look for; unlabelled boxes get filled with the wrong thing
                or not at all. */}
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
                // Under the field it belongs to rather than pooled at the
                // bottom with the errors: this one is a rule being explained
                // while it is being broken, and it stops mattering the moment
                // the tenth character lands.
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

              {/* --danger rather than the login form's accent wash: in a dialog
                  with three filled fields above it, this is the sentence that
                  says the press didn't take. */}
              {failure && (
                <p role="alert" className="text-[13px] text-danger">
                  {failure.error}
                  {locked && ` Try again in ${formatCountdown(cooldown)}.`}
                </p>
              )}

              {/* Cancel first, confirm at the right-hand end — the order every
                  dialog in this app uses. */}
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
                  // Seated only while it can be pressed: a lit button over
                  // three fields that aren't ready yet is the interface
                  // promising something it will refuse.
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

/**
 * One labelled password box.
 *
 * The label is a real `<label>` above the field rather than a placeholder
 * inside it: three identical boxes of dots are unreadable without standing
 * names, and a placeholder disappears exactly when the reader looks up to check
 * which one they are in.
 */
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
      {/* The well is the field's edge; the input inside draws nothing of its
          own — the same construction the tag rename field uses. */}
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
