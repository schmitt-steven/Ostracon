"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * PreviewPane renders sanitized/highlighted HTML via dangerouslySetInnerHTML,
 * so its wikilinks are plain <a> tags that would otherwise trigger a full
 * browser navigation. This delegated click handler intercepts clicks on them
 * and routes through next/navigation instead, keeping wikilink clicks
 * client-side without needing to turn the whole render pipeline into React
 * elements.
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
