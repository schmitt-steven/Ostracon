import { RECENCY_LABEL, type NoteRecency } from "@/lib/notes/recency";

type Props = {
  /** Nothing is rendered when the note had no activity today. */
  recency: NoteRecency | null;
  /** Pill metrics, so it can sit at the size of whichever tags it joins. */
  className?: string;
};

/**
 * A note's automatic tag, as it reads on the note itself.
 *
 * Dashed, like the suggested tags and the empty state, because that's what a
 * dashed pill means here — something the app is saying, not something the
 * user put on the note. It's also why this is a plain span rather than a
 * button: there's nothing to remove, and no stored tag behind it. The
 * selectable version of the same tags lives in [ListControls], where they
 * have to look like the filter pills they sit among.
 *
 * Its colour is its own token pair rather than a borrowed one — the two
 * themes take it in different directions (see --auto-tag in globals.css).
 *
 * No "use client" — it holds no state, so it renders on either side and is
 * shared by the server-rendered note page and the client-side list.
 */
export function RecencyTag({
  recency,
  className = "px-3 py-1 text-sm",
}: Props) {
  if (!recency) return null;

  return (
    <span
      className={`${className} rounded-full border border-dashed border-auto-tag/40 bg-auto-tag-wash font-medium text-auto-tag`}
    >
      {RECENCY_LABEL[recency]}
    </span>
  );
}
