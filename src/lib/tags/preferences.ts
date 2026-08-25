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

import { HUE_SLOTS, tagRoot } from "./hue";

export type TagPreferences = {
  /** Which tags are pinned. At most MAX_PINNED_TAGS of them are shown. */
  pinned: string[];
  /** Tag name → hue in degrees. Absent means "use the derived one". */
  hues: Record<string, number>;
  /**
   * The pinned rows' order, as [notePinKey]/[tagPinKey] strings.
   *
   * One list for both of the rail's pinned sections, not because they are one
   * list on screen — they aren't — but because the keys already say which kind
   * each row is, so each section can read this and take the positions of the
   * rows it contains. A row is only ever moved within its own section.
   *
   * Newest pin first: every pin writes its key to the front (see [recordPin]),
   * so the top of the section is what you last decided to keep, and moving a
   * row afterwards overwrites that with wherever you put it.
   *
   * Not a complete list of what's pinned and not required to be: keys for
   * things no longer pinned are ignored, and anything pinned that isn't named
   * here sorts to the end. So an empty order is the same as never having
   * reordered anything, which is what every existing install has stored.
   *
   * The *notes* half of this order is the one thing about a pin that lives in
   * the browser rather than the database — see [setPinnedOrder].
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

/**
 * Which of the two the key names. The rail draws the notes and the tags as
 * separate sections and moves a row only within its own, so it has to ask —
 * and asks here rather than matching the prefix itself, which would be a
 * second place that knows how these strings are spelled.
 */
export function isNotePinKey(key: string): boolean {
  return key.startsWith("n:");
}

/**
 * Five, the same as [MAX_PINNED_NOTES] — the two are separate sections in the
 * rail, stacked, so together they decide how far down the panel everything
 * under them sits. Five and five is ten rows at the very worst, which is still
 * a list you find a row in by shape rather than by reading.
 *
 * A pinned list long enough to need scanning is just the tag list again, one
 * section higher up, and the section below it already sorts by recent use —
 * which is the better answer for everything that isn't a deliberate favourite.
 */
export const MAX_PINNED_TAGS = 5;

const STORAGE_KEY = "skb:tag-prefs";

const EMPTY: TagPreferences = Object.freeze({
  pinned: Object.freeze([]) as unknown as string[],
  hues: Object.freeze({}) as Record<string, number>,
  order: Object.freeze([]) as unknown as string[],
});

/**
 * The slot closest to a stored hue, going the short way round the wheel so 350°
 * lands on 0 rather than on the last slot below it.
 */
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
    const { pinned, hues, order } = parsed as Partial<TagPreferences>;

    const cleanHues: Record<string, number> = {};
    if (hues && typeof hues === "object") {
      for (const [name, hue] of Object.entries(hues)) {
        // Only the sixteen slots are accepted back. An override is a choice
        // between the palette's own colours, not an escape from it.
        //
        // Snapped rather than dropped, because the palette has been a different
        // number of slots before: an override written against the old twelve
        // (30° steps) is a real choice the user made, and rejecting it would
        // silently hand the tag back its derived hue. Nearest slot keeps the
        // colour they picked as nearly as the current palette can say it.
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
    // Storage full or blocked — the in-memory snapshot still holds for this
    // session; only a reload forgets it.
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
      // The key goes with it, so the order doesn't accumulate names of things
      // that aren't there.
      order: current.order.filter((k) => k !== key),
    });
    return;
  }

  // Past the cap the press does nothing at all, rather than pushing the oldest
  // pin out to make room: the callers check [MAX_PINNED_TAGS] first and say
  // "unpin one to make room", and a store that quietly evicted instead would
  // make that message a lie.
  if (current.pinned.length >= MAX_PINNED_TAGS) return;

  // One commit, so the section doesn't render between the tag arriving and its
  // place being known. Any key still here is stale — unpinning removes it — so
  // this is [recordPin]'s prepend with nothing to preserve.
  commit({
    ...current,
    pinned: [tag, ...current.pinned],
    order: [key, ...current.order.filter((k) => k !== key)],
  });
}

/**
 * Puts a key at the top of the pinned order, which is where a thing just
 * pinned belongs — see [TagPreferences.order].
 *
 * Exported for the note pin, whose membership is a column in the database:
 * only the browser holds the order over both halves of the section, so the
 * button that writes the column tells this store where the new row goes.
 *
 * A key that is already named keeps its position rather than being moved back
 * up. Unpinning drops the key, so a key present here means the row is already
 * in the section — and pressing pin on something already pinned should no more
 * move it than the server's own no-op re-pin does.
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
 * Replaces the pinned order outright — both sections' keys, in one call.
 *
 * The caller passes the whole sequence rather than "move this one up", because
 * the rail is the only thing that knows what the sections actually contain: a
 * pinned note's *membership* is a column in the database and a pinned tag's is
 * this file, and neither half can see the other. Writing the full list also
 * drops any key for something no longer pinned, so the stored order stays the
 * size of the sections rather than the size of their history. A caller moving
 * a row in one section still passes the other section's keys along, or their
 * positions would be dropped with them.
 *
 * Which makes the note order device-local, unlike the pin itself: the notes'
 * membership is on the server but their arrangement is only ever decided here.
 * Pinning a note on a second machine still shows it there — at the end of the
 * notes section rather than wherever it was moved to here.
 */
export function setPinnedOrder(order: string[]): void {
  commit({ ...getTagPreferences(), order });
}

/**
 * Keyed on the *root* segment, because that's where the hue is read from (see
 * use-tag-hues): children inherit their parent's colour, so an entry under
 * `infra/ci` would be written, stored, and then never looked at again —
 * recolouring a nested tag would silently do nothing.
 */
export function setTagHue(tag: string, hue: number | null): void {
  const current = getTagPreferences();
  const root = tagRoot(tag);
  const hues = { ...current.hues };
  if (hue === null) delete hues[root];
  else hues[root] = hue;
  commit({ ...current, hues });
}
