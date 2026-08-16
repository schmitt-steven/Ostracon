import Link from "next/link";

/**
 * A link to the list rather than history.back(): notes are reached from
 * wikilinks and direct URLs too, where there's no list to go back to.
 *
 * Shown above the editor on both note routes — including /notes/new, where
 * leaving without typing anything creates nothing (autosave only fires once
 * the draft is dirty), so there's no half-made note to strand.
 */
export function BackToNotesLink() {
  return (
    <Link
      href="/"
      className="-ml-3 mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-base text-ink-muted transition-colors hover:bg-action-wash hover:text-action"
    >
      <span aria-hidden>←</span>
      All notes
    </Link>
  );
}
