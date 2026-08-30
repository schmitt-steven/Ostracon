"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * PreviewPane's HTML is injected, so its wikilinks are plain <a> tags. This
 * delegated handler routes clicks on them through next/navigation instead of a
 * full page load.
 */
export function WikilinkNav({ children }: { children: ReactNode }) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>(
      "a.wikilink",
    );
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    router.push(href);
  }

  return <div onClick={handleClick}>{children}</div>;
}
