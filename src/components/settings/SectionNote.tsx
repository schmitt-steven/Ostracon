import type { ReactNode } from "react";

/**
 * The line of prose a section opens with, under its heading. The `-mt-2.5`
 * cancels the 10px gap [SettingsView] puts below every section heading — too
 * far for a 13px line — so keep it in sync if that value changes.
 */
export function SectionNote({ children }: { children: ReactNode }) {
  return <p className="-mt-2.5 text-[13px] text-ink-faint">{children}</p>;
}
