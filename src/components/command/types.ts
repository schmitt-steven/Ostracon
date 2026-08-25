import type { NoteHit } from "@/hooks/use-search-index";

/**
 * A verb the palette offers, already resolved for the state it was built in —
 * "New note" carries the title it would be given, not a function of the query.
 *
 * `detail` is not optional. Every row in this palette states why it is there
 * and what it will do, and an action with a blank second line is the one row
 * that would sit in a list of explained things looking like a bug.
 */
export type PaletteAction = {
  id: string;
  label: string;
  /** The muted line under the label: what happens if you pick this. */
  detail: string;
  icon: ActionIcon;
  /** Shown right-aligned, in mono, when the verb also has a key. */
  shortcut?: string;
  /**
   * Whether picking this leaves the palette open. True for the verbs that
   * change what the palette is searching rather than navigating away from it —
   * closing on those would throw away the search you were setting up.
   */
  keepOpen?: boolean;
  run: () => void;
};

export type ActionIcon = "note" | "search" | "tag" | "upload" | "image" | "run";

export type Row =
  | { id: string; kind: "note"; note: NoteHit }
  | { id: string; kind: "tag"; name: string; count: number }
  | { id: string; kind: "action"; action: PaletteAction };

/** A titled run of rows. Headings are fixed by [sectionsFor]; nothing sorts. */
export type Section = { heading: string; rows: Row[] };
