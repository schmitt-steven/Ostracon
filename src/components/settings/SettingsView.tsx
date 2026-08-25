"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  LAST_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "./sections";
import { ThemeSetting } from "./ThemeSetting";

/**
 * View D — the app's own settings.
 *
 * One page rather than a tab strip or a stack of dialogs. Everything here is
 * about this instance, so what the reader wants is to *see* it all — which
 * section a setting lives in is a thing you learn by scrolling past it once,
 * and tabs hide four fifths of that from you at every moment. A dialog would be
 * worse still: settings are where you go to read as much as to change, and a
 * sheet you have to dismiss to look at the app behind it is a bad reading
 * surface.
 *
 * **The overview on the left is the price of that choice.** A single scrolling
 * page loses the one thing tabs are good at — always knowing where you are —
 * so the page says it instead: the section list sticks to the top of the pane
 * and lights the section the reader is currently standing on. It is a mirror of
 * the scroll position, not a second navigation; every row it holds is somewhere
 * on the page you are already on.
 *
 * The page's own title stands at the head of that list rather than across the
 * top of both columns, on the first section's baseline. A title spanning the
 * page would make the sections look filed *under* it; beside them, sharing
 * their line, it reads as the name of the list it introduces — and it stays
 * visible with the list once the page has scrolled.
 *
 * **No header bar, and so no [PaneScroller].** Every other view floats a glass
 * bar over its pane because every other view has somewhere to say you are
 * *within* — a tag, an index, the note's own toolbar. Settings has no inside
 * and no controls that belong to the whole page, so that bar had nothing in it
 * but its own background: a 60px band of glass at the top of the pane, blurring
 * the text passing under it on behalf of nothing. What replaces it is an
 * ordinary scrolling box, and the page simply starts at the top of the pane.
 *
 * The controls arrive one section at a time; Appearance has its theme,
 * Deployment has its facts, the rest are still empty. The empty ones are drawn
 * anyway, with their names and what each is for, because the shape of the page
 * is the thing being settled here — and because a section that gains a control
 * shouldn't be the first time the reader learns it exists.
 *
 * **Deployment comes in as a slot, not as data.** It is the one section whose
 * content is read off the server — the connection string, the blob token, the
 * commit the build came from — and none of that belongs in a browser bundle.
 * A server component rendered by the page and handed down as a `ReactNode`
 * arrives here already finished; this file lays it out without ever importing
 * the code that produced it. See [SettingsPage].
 */
export function SettingsView({ deployment }: { deployment: ReactNode }) {
  const [active, setActive] = useState<SettingsSectionId>(
    SETTINGS_SECTIONS[0]!.id,
  );

  const scroller = useRef<HTMLDivElement>(null);

  // Every section that has mounted, by id. A ref rather than state: this is
  // read during a scroll to measure against, and nothing about the page's
  // appearance depends on the map itself.
  const sections = useRef(new Map<SettingsSectionId, HTMLElement>());

  // One stable callback for all five rather than a factory per row — the
  // element already carries its own id, which is the only thing the map needs
  // to file it under, and a fresh closure per render would detach and reattach
  // every ref on every keystroke of state.
  const register = useCallback((element: HTMLElement | null) => {
    if (element) {
      sections.current.set(element.id as SettingsSectionId, element);
    }
  }, []);

  /**
   * Which section the reader is standing on, worked out from the scroll box
   * itself on every scroll.
   *
   * Measured rather than observed: an IntersectionObserver answers "is this on
   * screen", and with five short sections the honest answer is usually "three
   * of them are". What the overview has to light is the one whose heading the
   * reader has last passed, which is a comparison against a single line — the
   * top of the box plus the clearance the page keeps there. That clearance is
   * already declared as the scroller's `scroll-padding-top`, which is what
   * anchor jumps land against, so it is read back from there rather than
   * written down a second time as a number that could drift.
   *
   * Bottoming out is its own case. The last section can be shorter than the
   * space left below it, and then no amount of scrolling brings its heading up
   * to the line — so reaching the end of the box *is* being in the last
   * section, whatever the measurement says.
   */
  const syncActive = useCallback((box: HTMLDivElement) => {
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) {
      setActive(LAST_SETTINGS_SECTION.id);
      return;
    }

    const clearance = parseFloat(getComputedStyle(box).scrollPaddingTop) || 0;
    const line = box.getBoundingClientRect().top + clearance;

    let current = SETTINGS_SECTIONS[0]!.id;
    for (const section of SETTINGS_SECTIONS) {
      const element = sections.current.get(section.id);
      // +1 for the fraction of a pixel a smooth scroll lands off by, which
      // would otherwise leave the section you just jumped to unlit.
      if (element && element.getBoundingClientRect().top <= line + 1) {
        current = section.id;
      }
    }
    setActive(current);
  }, []);

  // The scroll handler answers for every position but the first one. Landing
  // on /settings#access scrolls the box before this ever renders, and that
  // scroll is the browser's rather than the reader's, so there is no event to
  // work from — hence one pass at mount, from whatever section is up there.
  useEffect(() => {
    if (scroller.current) syncActive(scroller.current);
  }, [syncActive]);

  /**
   * The overview's rows are anchors and behave like anchors — the hash goes in
   * the address bar, so a section can be linked to and comes back on a reload.
   * What is taken over from the browser is only the *manner* of the jump:
   * smoothly, unless the reader has asked for less motion, so that a press
   * three rows down reads as travel across the page rather than as the page
   * having been replaced.
   */
  function goTo(id: SettingsSectionId) {
    const element = sections.current.get(id);
    if (!element) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: still ? "auto" : "smooth" });
    // Lit now rather than when the scroll arrives: the press is the answer to
    // "where am I", and waiting a third of a second to agree with it looks
    // like the control missed.
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    // No wash vars, as the gallery and the tag directory do without them: this
    // page belongs to no tag, so `.pane` falls back to the neutral palette.
    <div className="pane pane-etched h-full">
      <div
        ref={scroller}
        onScroll={(event) => syncActive(event.currentTarget)}
        // One number for the top of this pane — --space-block — in both
        // senses: the space the page starts with, and the line an anchor jump
        // (or a section's turn in the overview) comes to rest on. The scrollbar
        // keeps the global --scroll-end inset, which is what it is for on a box
        // with nothing floating over it.
        //
        // Only the *scroll* padding is set here; the space itself is the
        // content's own padding, one box in. That split is not cosmetic. A
        // sticky child's constraint rectangle starts below the scroll
        // container's padding, so `padding-top: 32px` here and `top: 32px` on
        // the overview stack rather than coincide — the column comes to rest
        // 64px down, a full --space-block below the first section heading it is
        // supposed to line up with, before a single pixel has been scrolled.
        className="h-full overflow-y-auto scroll-pt-[var(--space-block)]"
      >
        {/* Wider than the 680px the reading views hold to, and only because
            there are two columns here: the sections keep a text measure of
            their own and the overview takes the rest. */}
        <div
          // Trailing space, deliberately deep. It is what lets every section —
          // including the last — be scrolled far enough for its heading to
          // reach the line the overview measures against; without it the
          // bottom two rows could never be lit by scrolling to them.
          className="mx-auto max-w-[880px] px-6 pt-[var(--space-block)] pb-[35vh]"
        >
          {/* Two columns above 900px and one below it. Narrower than that the
              overview would be a 100px column of clipped words beside a text
              measure with nothing left in it — so it stops being a margin and
              becomes the first thing on the page instead, which is what a
              contents list is on paper anyway. */}
          <div className="flex flex-col gap-[var(--space-block)] min-[900px]:flex-row min-[900px]:gap-12">
            {/* The page's title and its contents list, one block.

                The title used to run across the top of both columns, and it
                shouldn't have: a heading spanning the page says "everything
                below me", which put Appearance a step down from Settings when
                the two are the same rank — the page *is* its sections. Standing
                at the head of the overview it says what it actually is, which
                is the name of the list under it. It sticks with that list, so
                scrolled halfway down the page you can still see what place
                these five rows belong to. */}
            <div
              // self-start is what makes the sticky work: a flex item stretches
              // to the row's full height by default, and an element as tall as
              // its container has nowhere to stick to.
              //
              // It comes to rest on the same line everything else on this page
              // does — there is no header to clear now, so the clearance is the
              // pane's own.
              className="min-[900px]:sticky min-[900px]:top-[var(--space-block)] min-[900px]:w-[168px] min-[900px]:shrink-0 min-[900px]:self-start"
            >
              <h1
                // Sitting on the first section's baseline rather than at the
                // same top edge. Both are Fraunces at leading-tight, so the
                // first baseline of each falls 0.9865em below the top of its
                // line box — 27.6px at 28px, 21.7px at 22px — and the 6px
                // between them is exactly this pull. Left flush, the larger
                // title would appear to float a step above the heading it is
                // meant to line up with.
                className="-mt-1.5 font-display text-[28px] font-medium leading-tight text-ink"
              >
                Settings
              </h1>
              <nav
                aria-label="Settings sections"
                // The rail's own spacing for a heading over a list of rows —
                // --space-item, not the --space-group that separates one
                // section of the rail from the next. This *is* one group: a
                // name and the five rows it names. The title's own line box
                // adds its descender space on top, so the gap reads a little
                // wider than eight pixels, which is about right under 28px
                // type.
                className="mt-[var(--space-item)]"
              >
                <ul className="flex flex-col gap-[var(--space-item)]">
                  {SETTINGS_SECTIONS.map((section) => {
                    const here = section.id === active;
                    return (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            goTo(section.id);
                          }}
                          // "true" rather than "page": every row here points
                          // into the page you are already on, so none of them
                          // is the current *page* — what is being said is which
                          // location within it.
                          aria-current={here ? "true" : undefined}
                          // The rail's row, to the pixel — same padding, same
                          // 13px, same neutral selected tint. The two lists are
                          // the same object doing the same job at different
                          // scopes, and nothing is gained by drawing them apart.
                          className={`row-tint block truncate rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] ${
                            here ? "row-selected text-ink" : "text-ink-muted"
                          }`}
                        >
                          {section.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-block)]">
              {SETTINGS_SECTIONS.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  ref={register}
                  aria-labelledby={`${section.id}-heading`}
                >
                  <h2
                    id={`${section.id}-heading`}
                    className={`font-display text-[22px] font-medium leading-tight ${
                      // The one heading in the page that isn't ink. Colour is
                      // the only thing separating this section from the four
                      // above it, and it is the one section where knowing that
                      // before you read the control matters.
                      section.id === "danger" ? "text-danger" : "text-ink"
                    }`}
                  >
                    {section.label}
                  </h2>
                  {/* The controls stand on the page, in no container of their
                      own. A panel around them would be drawing a box to hold
                      one row — the heading above already says where a setting
                      belongs, and the --space-block between sections already
                      says where one ends. */}
                  <div className="mt-[var(--space-item)]">
                    {section.id === "appearance" ? (
                      <ThemeSetting />
                    ) : section.id === "deployment" ? (
                      deployment
                    ) : (
                      <p className="text-[13px] text-ink-faint">
                        Nothing to set here yet.
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
