/**
 * Which colours the four radial lights of the editor pane's wash are. The
 * gradients and strengths live in globals.css (`.pane`); this file only picks
 * hues. They come from the note's own tags — four-plus tags light it entirely,
 * fewer get the wheel filled in, none gets a near-neutral palette.
 */

/** How many lights the wash has. Four is what the gradient stack draws. */
const WASH_LIGHTS = 4;

export type WashLight = {
  /** Hue in degrees. */
  hue: number;
  /** Chroma, as a multiple of the tag palette's `--tag-c`. */
  chroma: number;
};

// A light from a real tag gets full chroma; one this file invented to fill a
// gap is stated at roughly half.
const TAG_CHROMA = 1;
const DERIVED_CHROMA = 0.55;

/**
 * The untagged pane: silver, a cool grey, two quiet violet-blues. Not zero
 * chroma — that reads as a vignette rather than a surface — just low enough to
 * barely register.
 */
const NEUTRAL: readonly WashLight[] = Object.freeze([
  { hue: 275, chroma: 0.3 }, // violet, the one you might notice
  { hue: 232, chroma: 0.22 }, // blue
  { hue: 250, chroma: 0.1 }, // silver
  { hue: 200, chroma: 0.14 }, // cool grey
]);

/** Positive modulo — `-30 % 360` is `-30` in JS, which is not a hue. */
function wrap(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Fills a short list of hues out to [WASH_LIGHTS] by repeatedly bisecting the
 * widest unused arc of the wheel — so added lights sit as far from the
 * existing ones as possible, deterministically.
 */
function fillWheel(hues: number[]): number[] {
  const out = [...hues];
  while (out.length < WASH_LIGHTS) {
    const sorted = [...out].sort((a, b) => a - b);
    let widest = -1;
    let pick = 0;
    for (let i = 0; i < sorted.length; i++) {
      const from = sorted[i]!;
      // The last arc wraps past 360 back to the first hue.
      const to = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + 360;
      const gap = to - from;
      if (gap > widest) {
        widest = gap;
        pick = wrap(from + gap / 2);
      }
    }
    out.push(pick);
  }
  return out;
}

/**
 * The wash for a note, in filed order — `tags[0]` is the top-left corner, the
 * colour the pane leads with. Duplicate hues are dropped rather than spent
 * twice.
 */
export function washLights(
  tags: readonly string[],
  hueOf: (tag: string) => number,
): WashLight[] {
  const hues: number[] = [];
  for (const tag of tags) {
    const hue = wrap(hueOf(tag));
    if (!hues.includes(hue)) hues.push(hue);
    if (hues.length === WASH_LIGHTS) break;
  }

  if (hues.length === 0) return [...NEUTRAL];

  return fillWheel(hues).map((hue, i) => ({
    hue,
    chroma: i < hues.length ? TAG_CHROMA : DERIVED_CHROMA,
  }));
}

/**
 * The lights as the custom properties `.pane` reads — raw numbers, not
 * finished colours, so lightness/chroma/alpha stay in CSS. Both properties are
 * registered (globals.css) so navigating between notes cross-fades the wash.
 */
export function washVars(lights: readonly WashLight[]): Record<string, string> {
  const vars: Record<string, string> = {};
  lights.forEach((light, i) => {
    vars[`--wash-h${i + 1}`] = String(Math.round(light.hue));
    vars[`--wash-c${i + 1}`] = String(light.chroma);
  });
  return vars;
}
