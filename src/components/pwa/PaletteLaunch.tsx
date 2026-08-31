"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { setPaletteOpen } from "@/lib/command/palette-state";

/**
 * Turns the manifest's Search shortcut back into an open palette.
 *
 * The other two shortcuts are routes and need nothing; search is ⌘K, which is
 * a piece of state rather than a place. The shortcut lands on /?search=1 and
 * this un-picks it, replacing the URL so the palette doesn't reopen on every
 * back-navigation to the index.
 */
export function PaletteLaunch() {
  const router = useRouter();
  const params = useSearchParams();
  const wanted = params.get("search") !== null;

  useEffect(() => {
    if (!wanted) return;
    setPaletteOpen(true);
    router.replace("/");
  }, [wanted, router]);

  return null;
}
