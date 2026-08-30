import { Suspense } from "react";
import { LocalDate } from "@/components/ui/LocalDate";
import { RelativeDate } from "@/components/ui/RelativeDate";
import { passwordChangedAt } from "@/lib/auth/password";
import { PasswordSetting } from "./PasswordSetting";
import { SessionsSetting } from "./SessionsSetting";

/**
 * Access — the password and the signed-in devices. A server component slotted
 * into [SettingsView] so the password hash never enters a client bundle; the
 * client halves are [PasswordSetting] and [SessionsTable]. Each query is
 * suspended inside its own row (both of known height) rather than around both.
 */
export function AccessSection() {
  return (
    <div className="flex flex-col gap-4">
      <PasswordSetting
        note={
          <Suspense fallback={<NoteSkeleton />}>
            <PasswordNote />
          </Suspense>
        }
      />
      <SessionsSetting />
    </div>
  );
}

/** When the password last changed, or that it never has (spelled out, not a dash). */
async function PasswordNote() {
  const changedAt = await passwordChangedAt();

  if (!changedAt) {
    return (
      <p className="text-[13px] text-ink-faint">
        Never changed — still the password this deployment was set up with.
      </p>
    );
  }

  const iso = changedAt.toISOString();
  return (
    <p className="text-[13px] text-ink-faint">
      Last changed{" "}
      <LocalDate
        date={iso}
        options={{ dateStyle: "medium", timeStyle: "short" }}
      />{" "}
      · <RelativeDate date={iso} long />
    </p>
  );
}

/** The same line with nothing in it yet — one line tall, so nothing shifts. */
function NoteSkeleton() {
  return (
    <p aria-hidden className="text-[13px] text-ink-faint">
      —
    </p>
  );
}
