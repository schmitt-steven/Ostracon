"use client";

type Props = {
  allTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
};

export function TagFilter({ allTags, selected, onChange }: Props) {
  if (allTags.length === 0) return null;

  function toggle(tag: string) {
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag],
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allTags.map((tag) => {
        const active = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={
              active
                ? "rounded-full bg-blue px-3.5 py-1.5 text-sm font-medium text-paper transition-colors"
                : "rounded-full border border-line-strong px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-blue hover:text-blue"
            }
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
