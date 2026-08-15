"use client";

export type ViewMode = "write" | "split" | "preview";

const MODES: { value: ViewMode; label: string }[] = [
  { value: "write", label: "Write" },
  { value: "split", label: "Split" },
  { value: "preview", label: "Preview" },
];

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

export function ViewModeToggle({ mode, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="View mode"
      // No border of its own — it sits inside the editor box's toolbar row,
      // which already provides the framing.
      className="flex shrink-0 items-center gap-1 rounded-full bg-paper-sunk/70 p-1"
    >
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          className={
            mode === value
              ? "rounded-full bg-blue px-4 py-1.5 text-sm font-medium text-paper transition-colors"
              : "rounded-full px-4 py-1.5 text-sm text-ink-muted transition-colors hover:text-blue"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
