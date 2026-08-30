"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  LAST_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "./sections";
import { ThemeSetting } from "./ThemeSetting";


export function SettingsView({
  ai,
  access,
  data,
  deployment,
}: {
  ai: ReactNode;
  access: ReactNode;
  data: ReactNode;
  deployment: ReactNode;
}) {
  const [active, setActive] = useState<SettingsSectionId>(
    SETTINGS_SECTIONS[0]!.id,
  );

  const scroller = useRef<HTMLDivElement>(null);

  // Mounted sections by id — a ref, read during scroll to measure against.
  const sections = useRef(new Map<SettingsSectionId, HTMLElement>());

  // One stable callback for all six — the element carries its own id.
  const register = useCallback((element: HTMLElement | null) => {
    if (element) {
      sections.current.set(element.id as SettingsSectionId, element);
    }
  }, []);

  /**
   * Which section the reader is on — the last heading passed above the
   * scroller's top + `scroll-padding-top` (read back so it can't drift from
   * where anchor jumps land). Reaching the bottom counts as the last section,
   * which can be too short to scroll its heading to the line.
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
      // +1 for the sub-pixel a smooth scroll lands off by.
      if (element && element.getBoundingClientRect().top <= line + 1) {
        current = section.id;
      }
    }
    setActive(current);
  }, []);

  // One pass at mount for the initial position — landing on /settings#access
  // scrolls before this renders, with no event to work from.
  useEffect(() => {
    if (scroller.current) syncActive(scroller.current);
  }, [syncActive]);

  /**
   * The overview rows are real anchors (hash in the address bar). Only the
   * manner of the jump is taken over: smooth, unless reduced-motion.
   */
  function goTo(id: SettingsSectionId) {
    const element = sections.current.get(id);
    if (!element) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: still ? "auto" : "smooth" });
    // Lit now, not when the scroll arrives.
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    // No wash vars — this page belongs to no tag, so `.pane` is neutral.
    <div className="pane pane-etched h-full">
      <div
        ref={scroller}
        onScroll={(event) => syncActive(event.currentTarget)}
        // Only scroll-padding here; the visual space is the content's own
        // padding one box in, so the sticky overview stacks with it rather than
        // doubling it.
        className="h-full overflow-y-auto scroll-pt-[var(--space-block)]"
      >
        {/* Wider than the 680px reading measure — two columns here. */}
        <div
          // Deep trailing space so even the last section can scroll its heading
          // to the measured line.
          className="mx-auto max-w-[880px] px-6 pt-[var(--space-block)] pb-[35vh]"
        >
          {/* Two columns above 900px, one below. */}
          <div className="flex flex-col gap-[var(--space-block)] min-[900px]:flex-row min-[900px]:gap-12">
            {/* Title + contents list, one sticky block. */}
            <div
              // self-start so the sticky has room to stick (a stretched flex
              // item is as tall as its container).
              className="min-[900px]:sticky min-[900px]:top-[var(--space-block)] min-[900px]:w-[168px] min-[900px]:shrink-0 min-[900px]:self-start"
            >
              <h1
                // Pulled up 6px to sit on the first section heading's baseline
                // rather than its top edge.
                className="-mt-1.5 font-display text-[28px] font-medium leading-tight text-ink"
              >
                Settings
              </h1>
              <nav
                aria-label="Settings sections"
                // The rail's heading-over-list spacing (--space-item).
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
                          // "true", not "page" — these point within the current page.
                          aria-current={here ? "true" : undefined}
                          // The rail's row, to the pixel.
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

            {/* 40px between sections — more than the 16px between rows, since a
                section's display-face heading needs the clear space. */}
            <div className="flex min-w-0 flex-1 flex-col gap-10">
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
                      // The one non-ink heading — Danger zone earns the warning.
                      section.id === "danger" ? "text-danger" : "text-ink"
                    }`}
                  >
                    {section.label}
                  </h2>
                  {/* Controls stand on the page, no panel. 10px under the
                      heading — 2px more than the rail's, for the display face's
                      descenders. */}
                  <div className="mt-2.5">
                    {section.id === "appearance" ? (
                      <ThemeSetting />
                    ) : section.id === "ai" ? (
                      ai
                    ) : section.id === "access" ? (
                      access
                    ) : section.id === "data" ? (
                      data
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
