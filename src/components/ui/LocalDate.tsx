"use client";

import { useId } from "react";
import { InlineScript } from "./InlineScript";

type Props = {
  date: string;
  options?: Intl.DateTimeFormatOptions;
};

/**
 * Renders a date/time in the viewer's own locale and timezone without a
 * hydration mismatch. toLocaleString() with no explicit locale/timezone is
 * environment-dependent — the server (Node) and the browser can format the
 * same instant differently — so naively rendering it during SSR produces a
 * client/server text mismatch on first load. Follows the pattern documented
 * at node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md:
 * an inline script corrects the DOM before hydration on hard navigations,
 * and toLocaleString() runs normally in the browser on soft navigations.
 */
export function LocalDate({ date, options }: Props) {
  const id = useId();

  return (
    <>
      <time id={id} dateTime={date} suppressHydrationWarning>
        {new Date(date).toLocaleString(undefined, options)}
      </time>
      <InlineScript
        html={`{var n=document.getElementById("${id}");if(n)n.textContent=new Date("${date}").toLocaleString(undefined,${JSON.stringify(options ?? undefined)})}`}
      />
    </>
  );
}
