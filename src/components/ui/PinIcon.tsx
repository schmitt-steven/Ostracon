/**
 * The pin, drawn once for the two things that can be pinned to the rail — a
 * note, from its own header, and a tag, from the head of its index.
 *
 * Same 24-unit box and same stroke as the trash it sits beside in the note
 * header, so the controls in a header read as one set. The head fills while the
 * thing is pinned: the outline alone was too quiet a difference at 16px to
 * carry a state on its own, next to a neighbour that is never filled at all.
 */
export function PinIcon({ filled }: { filled: boolean }) {
  return (
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
      <path
        d="M9 4h6l-.8 5.2 3 3.1V14H6.8v-1.7l3-3.1L9 4z"
        fill={filled ? "currentColor" : "none"}
      />
      <path d="M12 14v6" />
    </svg>
  );
}
