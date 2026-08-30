"use client";

import { useId } from "react";
import { InlineScript } from "./InlineScript";

type Props = {
  date: string;
  options?: Intl.DateTimeFormatOptions;
};

/**
 * A date/time in the viewer's locale and timezone, without a hydration
 * mismatch — server and browser can format the same instant differently. An
 * inline script corrects the DOM before hydration (the anti-FOUC pattern in
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
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
