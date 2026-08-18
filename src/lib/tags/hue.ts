/**
 * Every tag has a hue, and the user never picks one.
 *
 * The hue is *derived* from the name, which is what makes it free: a tag comes
 * into existence by being typed into a note body, and stopping to ask for a
 * colour at that moment would turn writing into configuring.
 *
 * Twelve fixed slots rather than `hash % 360`. With a continuous hue two tags
 * can land 4° apart, which doesn't read as "two colours" — it reads as a
 * rendering bug. Snapping to 30° steps means any two tags either share a slot
 * outright or sit far enough apart to tell apart at a glance. Collisions are
 * the acceptable failure here; near-misses are not.
 */

/** The twelve slots, evenly spaced around the wheel. */
export const HUE_SLOTS: readonly number[] = Array.from(
  { length: 12 },
  (_, i) => i * 30,
);

/**
 * FNV-1a, 32-bit. Any stable hash would do — what matters is that it's pure
 * and identical on both sides of the wire, so the server-rendered rail and the
 * client-rendered palette agree without shipping a colour table.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    // >>> 0 after the multiply keeps this in unsigned 32-bit range; the
    // shifts are the standard×16777619 decomposition.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** `#infra/ci` → `infra`. The segment a nested tag inherits its hue from. */
export function tagRoot(name: string): string {
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(0, slash);
}

/** How deep a nested tag sits. `infra` is 0, `infra/ci` is 1. */
export function tagDepth(name: string): number {
  let depth = 0;
  for (const char of name) if (char === "/") depth++;
  return depth;
}

/** The last segment — what a child row shows, since the parent is above it. */
export function tagLeaf(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

/**
 * The hue for a tag, in degrees.
 *
 * Children hash their *root*, so `#infra/ci` comes out the same hue as
 * `#infra`. That shared hue is what makes nesting legible without indent
 * guides — the child is the parent's colour, just quieter (see the `/ 0.6`
 * alpha and the smaller dot in globals.css).
 */
export function tagHue(name: string): number {
  return HUE_SLOTS[hash(tagRoot(name)) % HUE_SLOTS.length]!;
}
