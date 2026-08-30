"use client";

import { useState, type ReactNode } from "react";
import { PasswordDialog } from "./PasswordDialog";
import { SettingRow } from "./SettingRow";

/**
 * Access's first row: the password, and the one thing you can do to it.
 *
 * A [SettingRow] like every other row on this page, which is the whole of its
 * layout — a name, a button, and a line under the name.
 *
 * **What it says about the password goes in the note, not beside the name.**
 * The right-hand column is where a *control* goes, and a password has no value
 * that can be shown there; a row of dots would be a picture of a secret rather
 * than a fact about it. The fact worth having is when it last changed, and that
 * is a sentence, so it goes where the sentences go.
 *
 * That line arrives as a slot rather than as a prop, for the reason
 * [DeploymentSection] does: it is read out of the database, and the button
 * beside it is the only part that has to be in the browser.
 */
export function PasswordSetting({ note }: { note: ReactNode }) {
  const [changing, setChanging] = useState(false);

  return (
    <>
      <SettingRow
        name="Password"
        note={note}
        control={
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={changing}
            onClick={() => setChanging(true)}
            // Seated, at the height the theme track stands at, so the two rows
            // read as one column of controls rather than as a control and a
            // link.
            className="row-tint row-selected flex h-8 shrink-0 items-center rounded-[var(--radius-control)] px-3 text-[13px] text-ink"
          >
            Change password
          </button>
        }
      />

      {changing && <PasswordDialog onClose={() => setChanging(false)} />}
    </>
  );
}
