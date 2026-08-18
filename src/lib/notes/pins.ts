/**
 * How many notes may be pinned to the rail at once.
 *
 * Five. The pinned section sits above everything else in the rail, so its
 * whole value is that you can find a note in it without reading — which stops
 * being true at about the point the list needs scanning. Raising it is one
 * number: the cap is enforced in [setNotePinned] and read back by the button,
 * and nothing else counts pins.
 */
export const MAX_PINNED_NOTES = 5;
