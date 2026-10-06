"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { todayKey } from "@/lib/notes/daily";
import { dailyNoteHref } from "@/lib/tags/routes";

/** Resolves "today" in the browser's timezone, then hands off to the dated route. */
export default function TodayRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(dailyNoteHref(todayKey()));
  }, [router]);
  return null;
}
