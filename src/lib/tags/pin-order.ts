/**
 * Reorders the rail's pinned rows by a saved list of names (see
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
      // Unnamed (e.g. pinned from another machine) sorts last, not first.
      at: at.get(item.key) ?? Infinity,
    }))
    .sort((a, b) => a.at - b.at || a.arrived - b.arrived)
    .map(({ item }) => item);
}
