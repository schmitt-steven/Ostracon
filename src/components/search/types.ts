import type { NoteHit } from "@/hooks/use-search-index";

/**
 * A verb the search menu offers, resolved for the state it was built in — "New
 * note" carries the title it would get. `detail` is required: every row says
 * why it's there.
 */
export type SearchMenuAction = {
  id: string;
  label: string;
  /** The muted line under the label: what happens if you pick this. */
  detail: string;
  icon: ActionIcon;
  /** Shown right-aligned, in mono, when the verb also has a key. */
  shortcut?: string;
  /** Whether picking this leaves the search menu open — true for verbs that
   * re-aim the search rather than navigate away. */
  keepOpen?: boolean;
  run: () => void;
};

export type ActionIcon =
  | "note"
  | "search"
  | "tag"
  | "upload"
  | "image"
  | "theme"
  | "run";

export type Row =
  | { id: string; kind: "note"; note: NoteHit }
  | { id: string; kind: "tag"; name: string; count: number }
  | { id: string; kind: "action"; action: SearchMenuAction };

/**
 * A titled run of rows; nothing sorts. `empty` is the line shown under the
 * heading when `rows` is empty (Recent, before any note has been opened).
 */
export type Section = { heading: string; rows: Row[]; empty?: string };
