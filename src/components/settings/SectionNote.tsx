import type { ReactNode } from "react";

/**
 * The line of prose a section opens with, sitting directly under its heading.
 *
 * Two sections have one — AI, saying where each provider runs, and Deployment,
 * saying that a local build has no release to describe — and both are the same
 * thing: not the first *item* in the section but the rest of the sentence its
 * heading started.
 *
 * **So it takes no space from the heading, and this cancels the space it would
 * otherwise be given.** [SettingsView] stands every section's contents 10px
 * below its heading, which is the right distance to a 32px control and much too
 * far for a 13px line of type: at 10px the note floated between the heading and
 * the settings under it, belonging to neither. Zero is what [SettingRow] puts
 * between a setting's name and its own note, for the same reason, and the two
 * gaps should read alike — the leading on either side supplies the few pixels
 * that are actually wanted.
 *
 * The pull moves everything under it up by the same 10px, which is correct:
 * only the note's distance to the heading was wrong, and the gap from the note
 * to the first setting is left exactly as its section set it.
 *
 * If the 10px in [SettingsView] ever changes, this changes with it. That is the
 * price of expressing "no gap here" as a cancellation, and it is worth paying
 * over hard-coding the same number in two more files: there is one place that
 * decides how far a section's contents stand off its heading, and this says it
 * is opting out rather than quietly disagreeing.
 */
export function SectionNote({ children }: { children: ReactNode }) {
  return <p className="-mt-2.5 text-[13px] text-ink-faint">{children}</p>;
}
