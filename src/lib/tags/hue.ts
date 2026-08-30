/**
 * Every tag has a hue, derived from its name so the user never has to pick one.
 * Sixteen fixed 22.5° slots rather than `hash % 360`: two tags either share a
 * slot or sit far enough apart to tell apart — a near-miss reads as a bug.
 */

/** The sixteen slots, evenly spaced around the wheel. */
export const HUE_SLOTS: readonly number[] = Array.from(
  { length: 16 },
  (_, i) => i * 22.5,
);

/**
 * FNV-1a, 32-bit. Pure and identical on both sides of the wire, so the
 * server-rendered rail and client-rendered palette agree without a colour table.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    // `* 16777619` decomposed into shifts; `>>> 0` keeps it unsigned 32-bit.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** `#infra/ci` → `infra`. The segment a nested tag inherits its hue from. */
export function tagRoot(name: string): string {
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(0, slash);
}

/** The last segment — what a child row shows, since the parent is above it. */
export function tagLeaf(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

/**
 * The hue for a tag, in degrees. Children hash their *root*, so `#infra/ci`
 * shares a hue with `#infra` (drawn quieter — see globals.css).
 */
export function tagHue(name: string): number {
  return HUE_SLOTS[hash(tagRoot(name)) % HUE_SLOTS.length]!;
}
