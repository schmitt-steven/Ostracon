"use client";

import { useEffect, useState } from "react";
import { subscribeLogout } from "@/lib/auth/logout-request";
import { LogOutDialog } from "./LogOutDialog";

/**
 * Hosts [LogOutDialog] for the search menu's "Log out" row (via
 * [requestLogout]). Mounted in the shell, so a closing search menu doesn't take
 * the question with it.
 */
export function LogOutPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeLogout(() => setOpen(true)), []);

  if (!open) return null;
  return <LogOutDialog onClose={() => setOpen(false)} />;
}
