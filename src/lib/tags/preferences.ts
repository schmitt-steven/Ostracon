"use client";

// The two things about a tag the user *can* decide: whether it's pinned to the
// top of the rail, and — for anyone who cares enough to go looking — what hue
// it gets instead of its derived one.
//
// localStorage rather than the sessionStorage the list state uses: a pinned
// tag is a standing arrangement of the workspace, not a thing you're doing
// right now. And client-side rather than a column, because neither answer is
// part of what a note *is* — the notes stay the whole content model.
//
// Exposed as an external store (see `useSyncExternalStore`) for the same
// reason the AI provider choice is: the server has no way to know any of this,
// so the
// server snapshot is empty and the stored value swaps in right after
// hydration, which keeps the two renders in agreement.

import { HUE_SLOTS } from "./hue";

export type TagPreferences = {
  /** In the user's own order. The rail shows at most MAX_PINNED of them. */
  pinned: string[];
  /** Tag name → hue in degrees. Absent means "use the derived one". */
  hues: Record<string, number>;
};

/**
 * Eight. A pinned list long enough to need scanning is just the tag list
 * again, one section higher up, and the section below it already sorts by
 * recent use — which is the better answer for everything that isn't a
 * deliberate favourite.
 */
export const MAX_PINNED = 8;

const STORAGE_KEY = "skb:tag-prefs";

const EMPTY: TagPreferences = Object.freeze({
  pinned: Object.freeze([]) as unknown as string[],
  hues: Object.freeze({}) as Record<string, number>,
});

// Validated field by field: this is parsed from storage, which an older
// version of this code (or a user with the console open) could have written
// anything into, and a non-numeric hue would reach the CSS as `--h:undefined`
// and silently drop the colour rather than throwing anywhere visible.
function read(): TagPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY;
    const { pinned, hues } = parsed as Partial<TagPreferences>;

    const cleanHues: Record<string, number> = {};
    if (hues && typeof hues === "object") {
      for (const [name, hue] of Object.entries(hues)) {
        // Only the twelve slots are accepted back. An override is a choice
        // between the palette's own colours, not an escape from it.
        if (typeof hue === "number" && HUE_SLOTS.includes(hue)) {
          cleanHues[name] = hue;
        }
      }
    }

    return {
      pinned: Array.isArray(pinned)
        ? pinned.filter((t): t is string => typeof t === "string")
        : [],
      hues: cleanHues,
    };
  } catch {
    return EMPTY;
  }
}

let snapshot: TagPreferences | null = null;
const listeners = new Set<() => void>();

export function getTagPreferences(): TagPreferences {
  snapshot ??= read();
  return snapshot;
}

/** Always empty: nothing about this reaches the server. */
export function getServerTagPreferences(): TagPreferences {
  return EMPTY;
}

export function subscribeTagPreferences(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function commit(next: TagPreferences): void {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked — the in-memory snapshot still holds for this
    // session; only a reload forgets it.
  }
  for (const onChange of listeners) onChange();
}

export function togglePinned(tag: string): void {
  const current = getTagPreferences();
  const pinned = current.pinned.includes(tag)
    ? current.pinned.filter((t) => t !== tag)
    : [...current.pinned, tag].slice(0, MAX_PINNED);
  commit({ ...current, pinned });
}

/** Manual order, one step at a time — no drag targets to hit on a 26px row. */
export function movePinned(tag: string, direction: -1 | 1): void {
  const current = getTagPreferences();
  const index = current.pinned.indexOf(tag);
  const next = index + direction;
  if (index === -1 || next < 0 || next >= current.pinned.length) return;
  const pinned = [...current.pinned];
  [pinned[index], pinned[next]] = [pinned[next]!, pinned[index]!];
  commit({ ...current, pinned });
}

export function setTagHue(tag: string, hue: number | null): void {
  const current = getTagPreferences();
  const hues = { ...current.hues };
  if (hue === null) delete hues[tag];
  else hues[tag] = hue;
  commit({ ...current, hues });
}
