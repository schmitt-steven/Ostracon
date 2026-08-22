/**
 * The four lights of the editor pane's colour wash.
 *
 * The pane used to be a single flat tint of the context tag's hue. This is the
 * same idea with more air in it: four soft radial lights pushed out to the
 * corners, with a damper in the middle so the calmest region of the pane is
 * exactly where the text column sits. The gradients and the strengths live in
 * globals.css (`.pane`); what this file decides is only *which colours*
 * the four lights are.
 *
 * They come from the note's own tags, so a note carries the colour of what it
 * is about rather than the colour of the list it was opened from. A note with
 * four or more tags is lit entirely by them; one with fewer gets the rest of
 * the wheel filled in; one with none gets a near-neutral palette that reads as
 * paper rather than as a colour choice nobody made.
 */

/** How many lights the wash has. Four is what the gradient stack draws. */
export const WASH_LIGHTS = 4;

export type WashLight = {
  /** Hue in degrees. */
  hue: number;
  /**
   * Chroma, as a multiple of the tag palette's `--tag-c` — so the theme still
   * owns how saturated colour gets, and this only says how much of that a
   * given light is allowed.
   */
  chroma: number;
};

/**
 * A light whose hue the note actually chose, by wearing the tag, gets the
 * palette's full chroma. One this file invented to fill a gap is stated at
 * roughly half: a derived colour is a supporting tone, and letting it shout as
 * loudly as a real tag would make the wash claim more than the note said.
 */
const TAG_CHROMA = 1;
const DERIVED_CHROMA = 0.55;

/**
 * The untagged pane: silver, a cool grey, and two very quiet violet-blues.
 *
 * Not literally neutral — a wash with zero chroma over a grey surface is just
 * a vignette, and reads as a rendering artefact rather than a surface. These
 * sit low enough (a tenth to a third of the tag palette's chroma) that you'd
 * only name a colour if asked to, which is the right amount of presence for a
 * note that hasn't been filed yet.
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
 * Fills a short list of hues out to [WASH_LIGHTS] by repeatedly halving the
 * widest unused arc of the wheel.
 *
 * One tag therefore becomes an even tetrad (h, h+180, h+90, h+270), two tags
 * get the two arcs between them bisected, three get their widest gap filled.
 * The rule is "sit as far from every colour already here as possible", which
 * is the only thing that reliably keeps four soft lights from muddying into
 * one — and being deterministic, a note's wash is the same on every machine
 * and on every render.
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
 * The wash for a note, brightest light first — and the first light is the
 * top-left corner of the pane, so `tags[0]` is the colour the pane leads with.
 *
 * Take them in the order they were filed. Duplicate hues are dropped rather
 * than spent twice: two tags can hash to the same one of the twelve slots, and
 * a light doubled is a light wasted.
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
 * The lights as the custom properties `.pane` reads.
 *
 * Numbers rather than finished colours: lightness, chroma and every alpha stay
 * in CSS, where the theme can have an opinion about them. Both properties are
 * registered (see globals.css) so a change to either interpolates — navigating
 * between two notes cross-fades the wash instead of cutting to it.
 */
export function washVars(lights: readonly WashLight[]): Record<string, string> {
  const vars: Record<string, string> = {};
  lights.forEach((light, i) => {
    vars[`--wash-h${i + 1}`] = String(Math.round(light.hue));
    vars[`--wash-c${i + 1}`] = String(light.chroma);
  });
  return vars;
}
