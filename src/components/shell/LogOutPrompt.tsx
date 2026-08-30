"use client";

import { useEffect, useState } from "react";
import { subscribeLogout } from "@/lib/auth/logout-request";
import { LogOutDialog } from "./LogOutDialog";

/**
 * Hosts the log-out confirmation for askers with no dialog of their own — the
 * command palette's "Log out" row, via [requestLogout]. Mounted once in the
 * shell beside the palette, so the prompt outlives whatever asked for it and a
 * closing palette or drawer doesn't take the question with it.
 */
export function LogOutPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeLogout(() => setOpen(true)), []);

  if (!open) return null;
  return <LogOutDialog onClose={() => setOpen(false)} />;
}
