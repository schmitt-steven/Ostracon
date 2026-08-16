"use client";

import { useState } from "react";

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

const PILL = "rounded-full border px-3.5 py-1.5 text-sm transition-colors";

export function TagEditor({ tags, onChange }: Props) {
  // null while nothing is being added; the pending name (initially "") while
  // the add button has turned itself into the new tag's input.
  const [draft, setDraft] = useState<string | null>(null);

  function commitDraft() {
    const name = draft?.trim();
    if (name && !tags.includes(name)) onChange([...tags, name]);
    setDraft(null);
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onChange(tags.filter((t) => t !== tag))}
          aria-label={`Remove tag ${tag}`}
          title="Remove tag"
          className={`${PILL} group border-line-strong text-ink-muted hover:border-accent hover:bg-accent-wash hover:text-accent`}
        >
          <span className="group-hover:line-through">{tag}</span>
          <span
            aria-hidden
            className="ml-1.5 text-ink-faint transition-colors group-hover:text-accent"
          >
            ×
          </span>
        </button>
      ))}
      {draft === null ? (
        <button
          type="button"
          onClick={() => setDraft("")}
          className={`${PILL} border-dashed border-line-strong text-ink-faint hover:border-action hover:text-action`}
        >
          + tag
        </button>
      ) : (
        <span className={`${PILL} border-action bg-action-wash text-ink`}>
          <input
            // Focus the pill the moment it replaces the button — the click
            // that opened it was on a button that no longer exists, so
            // nothing else would put the caret here.
            autoFocus
            value={draft}
            // Grow with the name instead of reserving a fixed field width, so
            // the pill stays pill-sized.
            size={Math.max(draft.length + 1, 8)}
            placeholder="new tag"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") {
                setDraft(null);
              }
            }}
            // The global :focus-visible outline would draw an accent ring
            // inside the pill; the pill's own --action border and wash are the
            // focus affordance here. That rule is unlayered, so it outranks
            // any utility layer regardless of specificity — hence the `!`.
            className="bg-transparent text-sm text-ink outline-none focus-visible:outline-none!"
          />
        </span>
      )}
    </div>
  );
}
