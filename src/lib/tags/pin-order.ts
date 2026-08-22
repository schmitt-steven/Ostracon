/**
 * The one ordering the rail's pinned section has.
 *
 * Kept apart from the rail because it is the whole of what "the user moved
 * this row" means, and because the two halves it puts in sequence come from
 * different places — a pinned note is a column in the database, a pinned tag
 * is a key in localStorage. Neither store can order the other, so the order is
 * a list of names (see notePinKey/tagPinKey) that is matched against both.
 *
 * `order` is advisory in both directions: names for things that are no longer
 * pinned are ignored, and anything pinned that it doesn't name keeps the
 * position it arrived in, at the end. That is what makes an empty order —
 * every install that has never moved a row — mean "leave it as it was".
 *
 * Both the order and the arrival it falls back to run newest pin first, so an
 * untouched section reads most-recently-pinned at the top.
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
      // Unnamed sorts last, not first: a note pinned from another machine —
      // the one case a pin doesn't write a key here — appears at the foot of
      // the section rather than jumping over rows that were put where they are
      // on purpose.
      at: at.get(item.key) ?? Infinity,
    }))
    .sort((a, b) => a.at - b.at || a.arrived - b.arrived)
    .map(({ item }) => item);
}
