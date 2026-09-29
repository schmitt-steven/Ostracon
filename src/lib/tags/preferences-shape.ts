// The shape of the tag preferences, apart from the store that holds them.
//
// Its own module because both halves need it: the client store in
// [preferences] and the server reader/writer in [preferences-store]. The
// validation lives here too — the same untrusted-input problem on both sides,
// a row an older build wrote and an action payload a caller sent.

import { HUE_SLOTS, tagRoot } from "./hue";
import { normalizeTag, tagMatches } from "./parse";

export type TagPreferences = {
  /** Which tags are pinned. At most MAX_PINNED_TAGS of them are shown. */
  pinned: string[];
  /** Tag name → hue in degrees. Absent means "use the derived one". */
  hues: Record<string, number>;
  /**
   * The pinned rows' order, as [notePinKey]/[tagPinKey] strings — one list for
   * both sidebar sections, each reading the keys of its own kind. Newest pin
   * first (see [recordPin]); advisory, so unknown keys are ignored and
   * unnamed-but-pinned rows sort to the end.
   */
  order: string[];
};

/**
 * How a pinned note is named in [TagPreferences.order].
 *
 * The id, not the slug. A slug is freed when its note is deleted and handed to
 * the next note with the same title (see [uniqueSlugFor]), which would let a
 * new note inherit a deleted one's place in the sidebar. Ids are also what the
 * delete paths have in hand.
 */
export function notePinKey(noteId: string): string {
  return `n:${noteId}`;
}

/** How a pinned tag is named in [TagPreferences.order]. */
export function tagPinKey(tag: string): string {
  return `t:${tag}`;
}

/** Whether the key names a note (vs. a tag) — asked here, not by prefix-match. */
export function isNotePinKey(key: string): boolean {
  return key.startsWith("n:");
}

/** The tag a [tagPinKey] names. The one place that undoes the encoding, so no
 *  caller slices a prefix of its own. */
export function tagFromPinKey(key: string): string {
  return key.slice(2);
}

/** Five, matching [MAX_PINNED_NOTES] — ten stacked rows at worst, still
 * scannable by shape. */
export const MAX_PINNED_TAGS = 5;

export const EMPTY_TAG_PREFERENCES: TagPreferences = Object.freeze({
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

/** Whether nothing has been chosen yet — what decides the one-time lift of a
 *  device's [LEGACY_STORAGE_KEY] copy. */
export function isEmptyTagPreferences(preferences: TagPreferences): boolean {
  return (
    preferences.pinned.length === 0 &&
    preferences.order.length === 0 &&
    Object.keys(preferences.hues).length === 0
  );
}

/** Dedupes while keeping the first of each — a merge can name one tag twice. */
function unique(names: string[]): string[] {
  return [...new Set(names)];
}

/**
 * The preferences with a tag renamed: its pin, its hue and its order key move
 * to the new name.
 *
 * The bookkeeping half of [renameTag], which rewrites the notes but cannot
 * reach these. Descendants come along exactly as they do there (`#infra/ci`
 * under a rename of `#infra`), and renaming onto a name that is already pinned
 * merges the two rows rather than listing the name twice.
 *
 * Returns the same object when nothing moves, so the caller can skip the write.
 */
export function withTagRenamed(
  preferences: TagPreferences,
  from: string,
  to: string,
): TagPreferences {
  const source = normalizeTag(from);
  const target = normalizeTag(to);
  if (source === target) return preferences;

  const renamed = (name: string) =>
    tagMatches(name, source) ? `${target}${name.slice(source.length)}` : name;

  // Hues are per root, so only renaming a root moves one — and it never
  // displaces a hue the destination root already had.
  const hues = { ...preferences.hues };
  const sourceRoot = tagRoot(source);
  if (sourceRoot === source && sourceRoot in hues) {
    const hue = hues[sourceRoot]!;
    delete hues[sourceRoot];
    hues[tagRoot(target)] ??= hue;
  }

  return {
    pinned: unique(preferences.pinned.map(renamed)),
    hues,
    // Rewritten in place, so a row keeps its position across the rename.
    order: unique(
      preferences.order.map((key) =>
        isNotePinKey(key) ? key : tagPinKey(renamed(tagFromPinKey(key))),
      ),
    ),
  };
}

/**
 * The preferences with a tag and everything beneath it forgotten — the other
 * bookkeeping half, for a tag that is being deleted rather than renamed.
 *
 * Returns the same object when the tag owned neither a pin nor a hue.
 */
export function withTagCleared(
  preferences: TagPreferences,
  tag: string,
): TagPreferences {
  const root = tagRoot(tag);
  // Only a root carries a hue (see [setTagHue]).
  const losesHue = root === tag && root in preferences.hues;
  const doomed = new Set(
    preferences.pinned.filter((name) => tagMatches(name, tag)),
  );
  if (doomed.size === 0 && !losesHue) return preferences;

  const hues = { ...preferences.hues };
  if (losesHue) delete hues[root];

  return {
    pinned: preferences.pinned.filter((name) => !doomed.has(name)),
    hues,
    order: preferences.order.filter(
      (key) => isNotePinKey(key) || !doomed.has(tagFromPinKey(key)),
    ),
  };
}

/**
 * Validated field by field, since the caller is either a stored row or an
 * action payload. Anything unrecognised is dropped rather than rejected: these
 * are preferences, and half of them is better than none.
 */
export function normalizeTagPreferences(value: unknown): TagPreferences {
  if (typeof value !== "object" || value === null) return EMPTY_TAG_PREFERENCES;
  const { pinned, hues, order } = value as Partial<TagPreferences>;

  const cleanHues: Record<string, number> = {};
  if (hues && typeof hues === "object") {
    for (const [name, hue] of Object.entries(hues)) {
      // Snapped to a current slot, not dropped — an override written against
      // an older palette (12 slots, 30° steps) is still a real choice. Keyed
      // on the root, which is where the hue is read from (see use-tag-hues).
      if (typeof hue === "number" && Number.isFinite(hue)) {
        cleanHues[tagRoot(name)] = nearestSlot(hue);
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
}
