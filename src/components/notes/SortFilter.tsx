"use client";

import type { SortMode } from "@/hooks/use-note-search";

const OPTIONS: { value: SortMode; label: string }[] = [
  { value: "modified", label: "Last modified" },
  { value: "created", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "longest", label: "Most text" },
];

type Props = {
  value: SortMode;
  onChange: (mode: SortMode) => void;
};

export function SortFilter({ value, onChange }: Props) {
  return (
    // A native select rather than the pill row the tags use: pills here would
    // read as more tags, and unlike tags these four are mutually exclusive —
    // a select says "pick one" without spelling it out.
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortMode)}
        // No visible label — the selected option names itself. Screen readers
        // still need one, hence aria-label.
        aria-label="Sort notes"
        // Filled, not outlined: it sits just under the tag pills, whose
        // unselected state is an outline in this same size — so weight, rather
        // than shape, is what tells the two kinds of control apart. It shares
        // the fill with the view switcher at the other end of its row, which
        // is the intent: those two are the row's controls, the tags are data.
        // (No `outline-none`: the app's global focus-visible ring applies.)
        // pr-9 leaves room for the chevron; appearance-none drops the
        // platform arrow that would otherwise sit next to it.
        className="appearance-none rounded-full bg-paper-sunk py-1.5 pl-3.5 pr-9 text-sm font-medium text-ink transition-colors hover:text-action"
      >
        {OPTIONS.map(({ value: option, label }) => (
          <option key={option} value={option}>
            {label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
