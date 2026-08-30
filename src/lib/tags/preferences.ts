"use client";

// The two things about a tag the user can decide: whether it's pinned to the
// top of the rail, and what hue it gets instead of its derived one.
//
// localStorage (a standing arrangement, not a session thing) and client-side
// (neither answer is part of what a note is). An external store, like the AI
// provider choice — empty server snapshot, stored value swaps in after
// hydration.

import { HUE_SLOTS, tagRoot } from "./hue";

export type TagPreferences = {
  /** Which tags are pinned. At most MAX_PINNED_TAGS of them are shown. */
  pinned: string[];
  /** Tag name → hue in degrees. Absent means "use the derived one". */
  hues: Record<string, number>;
  /**
   * The pinned rows' order, as [notePinKey]/[tagPinKey] strings — one list for
   * both rail sections, each reading the keys of its own kind. Newest pin
   * first (see [recordPin]); advisory, so unknown keys are ignored and
   * unnamed-but-pinned rows sort to the end. The notes half lives only in the
   * browser — see [setPinnedOrder].
   */
  order: string[];
};

/** How a pinned note is named in [TagPreferences.order]. */
export function notePinKey(slug: string): string {
  return `n:${slug}`;
}

/** How a pinned tag is named in [TagPreferences.order]. */
export function tagPinKey(tag: string): string {
  return `t:${tag}`;
}

/** Whether the key names a note (vs. a tag) — asked here, not by prefix-match. */
export function isNotePinKey(key: string): boolean {
  return key.startsWith("n:");
}

/** Five, matching [MAX_PINNED_NOTES] — ten stacked rows at worst, still
 * scannable by shape. */
export const MAX_PINNED_TAGS = 5;

const STORAGE_KEY = "skb:tag-prefs";

const EMPTY: TagPreferences = Object.freeze({
  pinned: Object.freeze([]) as unknown as string[],
  hues: Object.freeze({}) as Record<string, number>,
  order: Object.freeze([]) as unknown as string[],
});

/** The slot closest to a stored hue, the short way round the wheel. */
function nearestSlot(hue: number): number {
  const wrapped = ((hue % 360) + 360) % 360;
  let best = HUE_SLOTS[0]!;
  let bestDistance = Infinity;
  for (const slot of HUE_SLOTS) {
    const raw = Math.abs(wrapped - slot);
    const distance = Math.min(raw, 360 - raw);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

// Validated field by field — parsed from storage, which an older build or a
// console user could have written anything into.
function read(): TagPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY;
    const { pinned, hues, order } = parsed as Partial<TagPreferences>;

    const cleanHues: Record<string, number> = {};
    if (hues && typeof hues === "object") {
      for (const [name, hue] of Object.entries(hues)) {
        // Snapped to a current slot, not dropped — an override written against
        // an older palette (12 slots, 30° steps) is still a real choice.
        if (typeof hue === "number" && Number.isFinite(hue)) {
          cleanHues[name] = nearestSlot(hue);
        }
      }
    }

    return {
      pinned: Array.isArray(pinned)
        ? pinned.filter((t): t is string => typeof t === "string")
        : [],
      hues: cleanHues,
      order: Array.isArray(order)
        ? order.filter((key): key is string => typeof key === "string")
        : [],
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
    // Storage full or blocked — the in-memory snapshot holds until reload.
  }
  for (const onChange of listeners) onChange();
}

export function togglePinned(tag: string): void {
  const current = getTagPreferences();
  const key = tagPinKey(tag);
  if (current.pinned.includes(tag)) {
    commit({
      ...current,
      pinned: current.pinned.filter((t) => t !== tag),
      // The key goes with it, so the order doesn't accumulate dead names.
      order: current.order.filter((k) => k !== key),
    });
    return;
  }

  // Past the cap the press does nothing — callers check first and tell the
  // user to unpin one.
  if (current.pinned.length >= MAX_PINNED_TAGS) return;

  // One commit, so the section doesn't render mid-update.
  commit({
    ...current,
    pinned: [tag, ...current.pinned],
    order: [key, ...current.order.filter((k) => k !== key)],
  });
}

/**
 * Puts a newly pinned key at the top of the order (see [TagPreferences.order]).
 * Exported for the note pin, whose membership lives in the database but whose
 * order lives here. A key already present keeps its position.
 */
export function recordPin(key: string): void {
  const current = getTagPreferences();
  if (current.order.includes(key)) return;
  commit({ ...current, order: [key, ...current.order] });
}

/** The other half of [recordPin]: an unpinned thing stops being named. */
export function forgetPin(key: string): void {
  const current = getTagPreferences();
  if (!current.order.includes(key)) return;
  commit({ ...current, order: current.order.filter((k) => k !== key) });
}

/**
 * Replaces the pinned order outright — both sections' keys in one call, since
 * the rail is the only thing that can see both. Keys for unpinned things are
 * dropped. Makes note order device-local, unlike the pin itself.
 */
export function setPinnedOrder(order: string[]): void {
  commit({ ...getTagPreferences(), order });
}

/**
 * Keyed on the root segment — where the hue is read from (see use-tag-hues).
 * An entry under a nested name would never be looked at.
 */
export function setTagHue(tag: string, hue: number | null): void {
  const current = getTagPreferences();
  const root = tagRoot(tag);
  const hues = { ...current.hues };
  if (hue === null) delete hues[root];
  else hues[root] = hue;
  commit({ ...current, hues });
}
