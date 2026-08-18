/**
 * Marks the bottom of a list.
 *
 * Nothing else does: there is no closing border, so a list that happens to end
 * at the fold would otherwise be indistinguishable from one the viewport cut
 * off. Decorative to a screen reader, which has its own way of knowing where a
 * list ends.
 */
export function Asterism() {
  return (
    <div aria-hidden className="asterism pt-[var(--space-block)]">
      ⁂
    </div>
  );
}
