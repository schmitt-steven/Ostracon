// How large the editor renders its text, as a percentage of the sizes the
// stylesheet sets. Kept outside React for the same reason as [list-state] and
// [provider-choice]: opening a note mounts a fresh editor, and a size that
// reset on every navigation would have to be re-set constantly.
//
// localStorage rather than session, unlike both of those: a filter or a model
// choice describes what you're doing right now, but how big type has to be to
// be readable is a property of the person and their screen. It should still be
// there next week.

// Versioned, and the version is load-bearing. The base sizes this scales were
// re-based upward once (100% now renders what 110% used to), which silently
// changes what every already-stored number means — anyone sitting on 110 would
// have come back to an effective 121%. Bumping the key drops those values so
// the new baseline is what they actually get. Re-base the sizes again and this
// has to move again.
const STORAGE_KEY = "skb:editor-font-scale-v2";

export const DEFAULT_FONT_SCALE = 100;
export const MIN_FONT_SCALE = 70;
export const MAX_FONT_SCALE = 180;
export const FONT_SCALE_STEP = 10;

/**
 * Integer percentages, deliberately: a float multiplier stepped by 0.1 drifts
 * (0.7000000000000001 after enough presses) and then never compares equal to
 * its own bounds, so the buttons at the ends stop disabling.
 */
function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SCALE;
  // Snapped to the step grid as well as clamped. Storage is user-writable and
  // an older build could have left another step size behind; without this a
  // stored 73 would make every step from then on land off-grid.
  const snapped = Math.round(value / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(Math.max(snapped, MIN_FONT_SCALE), MAX_FONT_SCALE);
}

// A primitive, so `getSnapshot` is referentially stable for free — same note as
// [provider-choice].
let snapshot = DEFAULT_FONT_SCALE;
let loaded = false;
const listeners = new Set<() => void>();

function read(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_FONT_SCALE;
    // `Number("")` is 0, not NaN, so an empty entry would clamp to the minimum
    // and silently shrink the editor rather than reading as "nothing stored".
    const parsed = Number(stored);
    return parsed > 0 ? clamp(parsed) : DEFAULT_FONT_SCALE;
  } catch {
    // Storage blocked (Safari private mode) — the size just won't outlive the
    // page load.
    return DEFAULT_FONT_SCALE;
  }
}

export function getFontScale(): number {
  if (!loaded) {
    loaded = true;
    snapshot = read();
  }
  return snapshot;
}

/** The default: the server has no storage to read a preference out of. */
export function getServerFontScale(): number {
  return DEFAULT_FONT_SCALE;
}

export function subscribeFontScale(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setFontScale(value: number): void {
  const next = clamp(value);
  // Compared against getFontScale() rather than the raw snapshot: until
  // something has read it, `snapshot` still holds the default rather than
  // what's in storage, and the early return would compare against the wrong
  // value and then leave the stale default marked as loaded.
  if (next === getFontScale()) return;
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // In-memory snapshot still carries it across navigations in this tab.
  }
  for (const onChange of listeners) onChange();
}

/** One press of the smaller/larger buttons. */
export function stepFontScale(direction: 1 | -1): void {
  setFontScale(getFontScale() + direction * FONT_SCALE_STEP);
}
