import Link from "next/link";

/**
 * Narrows the overview to the images the notes contain, and back.
 *
 * A one-state chip rather than a notes/images pair: the images *are* the
 * notes' contents, so offering the two as peers framed them as separate
 * sections. This reads the way the tag pills above it do — a filter that's
 * either on or off — while still being a real link, so the view stays
 * addressable and the back button keeps working.
 */
export function ImagesToggle({ active }: { active: boolean }) {
  return (
    <Link
      href={active ? "/" : "/?view=images"}
      // Not aria-pressed: that belongs to role=button, and this is a link.
      // "true" rather than "page" because the href points away from the
      // current view — it's the current item, not the current destination.
      aria-current={active ? "true" : undefined}
      // The visible label names the filter, so the tooltip is free to name
      // what a click actually does.
      title={active ? "Back to all notes" : "Show the images in your notes"}
      // Matches the sort control at the other end of the row: same fill, same
      // radius, same py-1.5 height. Filled instead of outlined so it doesn't
      // read as one more tag pill from the row above.
      className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-blue text-paper"
          : "bg-paper-sunk text-ink hover:text-blue"
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <rect x="3" y="3" width="18" height="18" rx="2.5" />
        <circle cx="8.75" cy="8.75" r="1.6" />
        <path d="m20.5 15.5-4-4a2 2 0 0 0-2.83 0L5.5 20" />
      </svg>
      Images
    </Link>
  );
}
