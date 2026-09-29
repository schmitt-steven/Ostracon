"use client";

// The two things about a tag the user can decide: whether it's pinned to the
// top of the sidebar, and what hue it gets instead of its derived one. Plus the
// order the pinned rows sit in, which covers pinned notes as well.
//
// The store is an external one, like the AI provider choice, so it survives
// navigation between notes. What it is *not* any more is localStorage-backed:
// these are standing decisions about the sidebar, so they belong to the
// account, not to the browser that happened to make them. The server renders
// the seed (see [TagPreferencesProvider]) and every change is mirrored to
// [saveTagPreferencesAction].

import { tagRoot } from "./hue";
import {
  EMPTY_TAG_PREFERENCES,
  isEmptyTagPreferences,
  isNotePinKey,
  MAX_PINNED_TAGS,
  normalizeTagPreferences,
  tagPinKey,
  withTagCleared,
  withTagRenamed,
  type TagPreferences,
} from "./preferences-shape";
import { saveTagPreferencesAction } from "./actions";

export {
  isNotePinKey,
  MAX_PINNED_TAGS,
  notePinKey,
  tagFromPinKey,
  tagPinKey,
  type TagPreferences,
} from "./preferences-shape";

/** Where a pre-sync build kept all of this. Read once, then removed — see
 *  [liftLegacyTagPreferences]. */
const LEGACY_STORAGE_KEY = "skb:tag-prefs";

let snapshot: TagPreferences | null = null;
const listeners = new Set<() => void>();

/**
 * Hands the store the row the server rendered with. Browser only — see
 * [TagPreferencesProvider] for why the server reads the row through context
 * instead.
 *
 * Only the first call lands. A later navigation re-renders the layout and
 * offers the row again, but adopting it would undo a pin made a moment ago and
 * not yet committed: the row is the authority across loads, this store within
 * one.
 */
export function seedTagPreferences(stored: TagPreferences): void {
  snapshot ??= stored;
}

/** Empty only outside the shell, which is the one place with no row to seed
 *  from (the login page). */
export function getTagPreferences(): TagPreferences {
  return snapshot ?? EMPTY_TAG_PREFERENCES;
}

export function subscribeTagPreferences(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * Applies a snapshot here and sends the same one to the server.
 *
 * Optimistic, and deliberately not awaited: a pin should land on the frame it
 * was pressed. A failed write is left to `useOffline`, which holds the action
 * pending and retries it once the network is back, so the catch here is for the
 * rejections that aren't about the network.
 */
function commit(next: TagPreferences): void {
  snapshot = next;
  void saveTagPreferencesAction(next).catch(() => {
    // Nothing to show: the sidebar is the feedback, and it already moved.
  });
  for (const onChange of listeners) onChange();
}

/**
 * Moves a device's leftover localStorage copy into the row, once.
 *
 * The row wins whenever it has anything in it — a second device arriving with
 * its own stale copy must not overwrite what the first one synced. Either way
 * the key goes, so this is a one-time event per browser.
 */
export function liftLegacyTagPreferences(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw !== null) localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage blocked (Safari private mode) — nothing to lift.
    return;
  }
  if (raw === null) return;

  if (!isEmptyTagPreferences(getTagPreferences())) return;

  try {
    const stored = normalizeTagPreferences(JSON.parse(raw));
    // Its note keys named slugs, which [notePinKey] no longer does, so they
    // would name nothing. Dropped rather than carried: the pinned notes
    // themselves are in their own column and arrive in pinned-at order, which
    // is where an un-named row sorts anyway.
    const legacy = {
      ...stored,
      order: stored.order.filter((key) => !isNotePinKey(key)),
    };
    if (!isEmptyTagPreferences(legacy)) commit(legacy);
  } catch {
    // Unparseable, and now gone. Nothing was pinned that we can tell.
  }
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

/** Commits a transform, or nothing at all when it left the snapshot alone. */
function commitIfChanged(next: TagPreferences): void {
  if (next !== getTagPreferences()) commit(next);
}

/**
 * Carries a tag's pin, its hue and its order key over to a new name — one
 * commit, so the sidebar doesn't render mid-rename. See [withTagRenamed].
 */
export function renameTagInPreferences(from: string, to: string): void {
  commitIfChanged(withTagRenamed(getTagPreferences(), from, to));
}

/**
 * Drops the pins and the hue a tag and its descendants own, in one commit —
 * [TagDeleteDialog] snapshots beforehand and hands that back to
 * [restoreTagPreferences] on undo.
 */
export function clearTagFromPreferences(tag: string): void {
  commitIfChanged(withTagCleared(getTagPreferences(), tag));
}

/** Puts a whole snapshot back — the undo half of a rename or a tag delete. */
export function restoreTagPreferences(preferences: TagPreferences): void {
  commit(preferences);
}

/**
 * Puts a newly pinned key at the top of the order (see [TagPreferences.order]).
 * Exported for the note pin, whose membership lives in its own column but whose
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
 * the sidebar is the only thing that can see both. Keys for unpinned things are
 * dropped.
 */
export function setPinnedOrder(order: string[]): void {
  commit({ ...getTagPreferences(), order });
}

/**
 * Reorders the sidebar's pinned rows by a saved list of names (see
 * notePinKey/tagPinKey), applied once per section. `order` is advisory:
 * unknown names are ignored, and anything it doesn't name keeps its arrival
 * position at the end — so an empty order means "leave it as it was". Both
 * orderings run newest-pin-first.
 */
export function sortByPinOrder<T extends { key: string }>(
  items: T[],
  order: string[],
): T[] {
  const at = new Map(order.map((key, index) => [key, index]));
  return items
    .map((item, arrived) => ({
      item,
      arrived,
      // Unnamed (a pin older than the order it belongs in) sorts last, not first.
      at: at.get(item.key) ?? Infinity,
    }))
    .sort((a, b) => a.at - b.at || a.arrived - b.arrived)
    .map(({ item }) => item);
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
