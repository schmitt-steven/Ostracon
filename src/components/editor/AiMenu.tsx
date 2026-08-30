"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACTION_LABELS,
  AI_ACTIONS,
  type AiAction,
  type ProviderInfo,
} from "@/lib/ai/types";
import { menuItem } from "@/components/shell/ContextMenu";

const MENU_WIDTH = 232;

type Props = {
  x: number;
  y: number;
  /** False when opened at the bare cursor — only the question box is offered. */
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
  // No selection ⇒ the question box is the whole menu.
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

  // Keep the fixed-positioned menu inside the viewport.
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
        // Every provider unusable — show the first one's reason.
        <p className="px-4 py-3 text-sm text-ink-muted">
          No AI provider available. {providers[0]?.unavailableReason ?? ""}
        </p>
      ) : asking ? (
        <form
          className="p-1.5"
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
            className="well w-full rounded-[var(--radius-control)] bg-sunk px-3 py-2 text-sm text-ink outline-none focus-visible:outline-none!"
          />
        </form>
      ) : (
        <div className="p-1.5">
          {AI_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              onClick={() => {
                if (action === "ask") setAsking(true);
                else onPick(action);
              }}
              className={menuItem}
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
