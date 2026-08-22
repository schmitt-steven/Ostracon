"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACTION_LABELS,
  AI_ACTIONS,
  type AiAction,
  type ProviderInfo,
} from "@/lib/ai/types";

const MENU_WIDTH = 232;

type Props = {
  x: number;
  y: number;
  /**
   * False when opened from the cursor with nothing selected: the three
   * transform actions have no input, so only the question box is offered.
   */
  hasSelection: boolean;
  /** null while the provider list is still being fetched. */
  providers: ProviderInfo[] | null;
  /** null when nothing has been picked yet this session. */
  providerId: string | null;
  onProviderChange: (id: string) => void;
  onPick: (action: AiAction, question?: string) => void;
  onClose: () => void;
};

export function AiMenu({
  x,
  y,
  hasSelection,
  providers,
  providerId,
  onProviderChange,
  onPick,
  onClose,
}: Props) {
  // With no selection there's nothing to list, so the box is the whole menu
  // and the shortcut lands the user straight in it, typing.
  const [asking, setAsking] = useState(!hasSelection);
  const [question, setQuestion] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Flip the menu back inside the viewport when the click lands near an edge —
  // fixed positioning would otherwise let it hang off-screen.
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 12);
  const top = Math.min(y, window.innerHeight - 220);

  const provider = providers?.find((p) => p.id === providerId);
  const usable = providers?.filter((p) => p.available) ?? [];

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left, top, width: MENU_WIDTH }}
      className="glass lift-2 fixed z-50 overflow-hidden rounded-[var(--radius-zone)]"
    >
      {providers === null ? (
        <p className="px-4 py-3 text-sm text-ink-faint">Loading providers…</p>
      ) : usable.length === 0 ? (
        // Every provider is unusable — show why for the first one, which is
        // the actionable case (an unset key) rather than a silent empty menu.
        <p className="px-4 py-3 text-sm text-ink-muted">
          No AI provider available. {providers[0]?.unavailableReason ?? ""}
        </p>
      ) : asking ? (
        <form
          className="p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) onPick("ask", question);
          }}
        >
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              hasSelection ? "Ask about the selection…" : "Ask about this note…"
            }
            className="well w-full rounded-[var(--radius-control)] bg-sunk px-3 py-2 text-sm text-ink outline-none transition-colors focus:bg-action-wash"
          />
        </form>
      ) : (
        <div className="py-1">
          {AI_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              onClick={() => {
                if (action === "ask") setAsking(true);
                else onPick(action);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-action-wash hover:text-action"
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}

      {usable.length > 0 && (
        <div className="zone-step flex items-center gap-2 px-3 py-2">
          <select
            value={provider?.available ? provider.id : (usable[0]?.id ?? "")}
            onChange={(e) => onProviderChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs text-ink-muted outline-none"
          >
            {usable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.model}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
