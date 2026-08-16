"use client";

type Props = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export function TagSuggestToggle({ enabled, onChange }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      className={
        enabled
          ? "flex shrink-0 items-center gap-2 rounded-full bg-action px-3.5 py-1.5 text-sm font-medium text-paper transition-colors"
          : "flex shrink-0 items-center gap-2 rounded-full border border-line-strong px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-action hover:text-action"
      }
    >
      <span
        className={
          enabled
            ? "h-2 w-2 rounded-full bg-accent"
            : "h-2 w-2 rounded-full bg-line-strong"
        }
      />
      Suggest tags
    </button>
  );
}
