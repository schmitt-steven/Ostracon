"use client";

export type ViewMode = "write" | "split" | "preview";

export const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "write", label: "Write" },
  { value: "preview", label: "Preview" },
   { value: "split", label: "Split" },
];

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

/**
 * The mode switch: one control, in two shapes.
 *
 * Wide, it is a segmented track — a single seated object with a marker that
 * slides between three labels, rather than the three loose buttons this
 * replaces. Three separate hit targets sitting in a row asked the eye to work
 * out that they belonged together; a track says it outright, and the marker
 * moving from one segment to the next shows the switch as one state changing
 * instead of two independent buttons lighting up.
 *
 * Below the shell's 1000px it is a single button that swaps between writing
 * and reading. Split is gone there — two columns inside a phone's width are
 * two columns too narrow to read either of them, so the mode isn't offered
 * (NoteEditor drops it from the palette too, and folds it back to Write if
 * the window is dragged down past the breakpoint). With one choice left,
 * three segments' worth of header would be spent saying what one word says:
 * the button is labelled with the side you aren't on, and pressing it goes
 * there.
 *
 * The active state is a small step in surface tone and a step in text
 * contrast. Nothing here is coloured: colour in this design means "this is a
 * tag", and spending it on a view toggle would dilute the one thing hue is
 * for.
 */
export function ViewModeToggle({ mode, onChange }: Props) {
  // Split collapses to the writing surface on a narrow screen, so the compact
  // button treats it as Write — true for the frame between a resize and the
  // fold-back, and the honest reading of it in any case.
  const previewing = mode === "preview";
  const index = Math.max(
    VIEW_MODES.findIndex((m) => m.value === mode),
    0,
  );

  return (
    <>
      <div
        role="group"
        aria-label="View mode"
        // p-0.5 is the track's inset, and the marker's `inset-y-0.5` /
        // `left-0.5` / `-4px` below are that same 2px — the marker sits inside
        // the track rather than on top of its edge.
        className="relative hidden shrink-0 rounded-[var(--radius-control)] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] p-0.5 min-[1000px]:grid min-[1000px]:grid-cols-3"
      >
        <span
          aria-hidden
          style={{ transform: `translateX(${index * 100}%)` }}
          className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-[calc(var(--radius-control)-2px)] bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] transition-transform duration-200 ease-out motion-reduce:transition-none"
        />
        {VIEW_MODES.map(({ value, label }) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              aria-pressed={active}
              // Equal columns with a floor, so the marker's third always
              // matches the segment under it and the track doesn't jitter as
              // the labels change length.
              className={`relative min-w-[68px] rounded-[calc(var(--radius-control)-2px)] px-3 py-1 text-[13px] transition-colors duration-200 motion-reduce:transition-none ${
                active ? "text-ink" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Touch only. No aria-label over the top of the text: the word in the
          button is the name of the button, and a spoken label that disagreed
          with it would break saying it out loud to click it. */}
      <button
        type="button"
        onClick={() => onChange(previewing ? "write" : "preview")}
        className="row-tint flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-[13px] text-ink-muted min-[1000px]:hidden"
      >
        {previewing ? <PencilIcon /> : <EyeIcon />}
        {previewing ? "Write" : "Preview"}
      </button>
    </>
  );
}

/* Drawn here rather than imported, the way the shell's bottom bar keeps its
   own three: same 16-unit box, same 1.3 stroke, same round caps, so the two
   sets read as one family. */
function PencilIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11.1 2.6 13.4 4.9 6.2 12.1 3 12.9l0.8-3.2z" />
      <path d="M9.8 3.9 12.1 6.2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 8S4 3.9 8 3.9 14.5 8 14.5 8 12 12.1 8 12.1 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.9" />
    </svg>
  );
}
