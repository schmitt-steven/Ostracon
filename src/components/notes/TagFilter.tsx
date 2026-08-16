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

  // A fragment, not a row of its own: the filter bar in NoteList lays the tags
  // out in the same wrapping flow as the sort control, so the two can't be
  // nested flex containers.
  return (
    <>
      {allTags.map((tag) => {
        const active = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={
              active
                ? "rounded-full bg-action px-3.5 py-1.5 text-sm font-medium text-paper transition-colors"
                : "rounded-full border border-line-strong px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-action hover:text-action"
            }
          >
            {tag}
          </button>
        );
      })}
    </>
  );
}
