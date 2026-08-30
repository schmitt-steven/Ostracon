/**
 * The settings page's sections, in print order — one list read by both the
 * overview and the sections so they can't drift. Ordered by how often each is
 * touched, with the irreversible one last.
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
  // Below the instance settings (Data writes to the collection), above the
  // read-only Deployment.
  { id: "data", label: "Data" },
  { id: "deployment", label: "Deployment" },
];

/** The last one, which the overview needs by name — see the scroll-spy. */
export const LAST_SETTINGS_SECTION =
  SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1]!;
