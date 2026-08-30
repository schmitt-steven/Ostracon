/**
 * What the settings page is made of, in the order it prints them.
 *
 * One list, read twice — by the overview on the left and by the sections on
 * the right — so the two can't drift apart. A section that exists is a row in
 * the overview, and a row in the overview is somewhere on the page; neither
 * half can add or lose one on its own.
 *
 * The order is the order of how often a setting is touched, with the one
 * nobody should touch by accident held at the bottom. Appearance is first
 * because it is the one anybody changes on a whim; Danger zone is last because
 * a list you scroll to the end of is the least likely place to land in by
 * mistake, and because everything above it is reversible.
 */

export type SettingsSectionId =
  | "appearance"
  | "ai"
  | "access"
  | "data"
  | "deployment"
  | "danger";

export type SettingsSection = {
  id: SettingsSectionId;
  /** The overview's row and the section's own heading — always the same words. */
  label: string;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "appearance", label: "Appearance" },
  { id: "ai", label: "AI Integrations" },
  { id: "access", label: "Access" },
  // Between the settings you change and the facts you only read. Data holds
  // the one control on this page that writes to the collection itself, which
  // puts it below everything that merely configures the instance — and above
  // Deployment, which changes nothing at all.
  { id: "data", label: "Data" },
  { id: "deployment", label: "Deployment" },
];

/** The last one, which the overview needs by name — see the scroll-spy. */
export const LAST_SETTINGS_SECTION =
  SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1]!;
