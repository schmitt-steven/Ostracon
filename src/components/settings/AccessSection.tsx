import { Suspense } from "react";
import { LocalDate } from "@/components/ui/LocalDate";
import { RelativeDate } from "@/components/ui/RelativeDate";
import { passwordChangedAt } from "@/lib/auth/password";
import { PasswordSetting } from "./PasswordSetting";
import { SessionsSetting } from "./SessionsSetting";

/**
 * Access — who can get in, and with what.
 *
 * Two rows, and they are the two halves of one question. The password is what
 * opens the door; the sessions are who is already through it. Read together
 * they are the answer to "is this instance still only mine" — which is why
 * changing the password signs the other devices out, and why the list of them
 * is directly underneath rather than in a section of its own.
 *
 * That order is the order of the answer. You change the password because
 * something in the list surprised you, or you read the list because you just
 * changed the password; either way the control comes first and the evidence
 * second, and the evidence is the taller of the two.
 *
 * A server component handed to [SettingsView] as a slot, like
 * [DeploymentSection] and for a stricter version of the same reason: what it
 * reads is the password row, and the surest way for a hash and its parameters
 * never to reach a browser bundle is for the code that touches them never to be
 * in one. The client halves are the button that opens the dialog
 * ([PasswordSetting]) and the sign-out buttons in the table
 * ([SessionsTable]) — nothing else crosses.
 *
 * Each read is suspended *inside* the row it belongs to rather than around the
 * pair. The names and the buttons are static and can be painted with the rest
 * of the page; the two things that have to wait for a query — when the password
 * last changed, and which devices are signed in — are each one line and one
 * short table, of known heights. So what waits is a dash where a sentence goes,
 * rather than a hole where the section goes.
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

/**
 * When the password last changed, or that it never has.
 *
 * "Never" is the more useful of the two answers and the one most likely to be
 * true, so it is spelled out rather than left as an em dash: a deployment
 * running on the password it was handed at setup is running on a string that
 * has been in a `.env` file, in a platform dashboard, and probably in a
 * terminal history. Saying which state you are in is the whole reason this line
 * is on the page.
 *
 * The date is printed twice over — absolute and relative — as everything dated
 * in this app is. "Last week" answers the question; the date is what you check
 * it against.
 */
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
