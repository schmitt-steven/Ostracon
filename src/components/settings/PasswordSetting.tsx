"use client";

import { useState, type ReactNode } from "react";
import { PasswordDialog } from "./PasswordDialog";
import { SettingRow } from "./SettingRow";

/**
 * Access's first row: the password and the Change button. The "last changed"
 * line goes in the note (a password has no value to show beside the name),
 * passed as a slot since it's read from the database.
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
            // Seated, at the theme track's height, so the column reads as one.
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
