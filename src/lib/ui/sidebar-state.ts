"use client";

// Whether the desktop sidebar is showing, held outside React in localStorage (a
// standing arrangement, like the tag preferences). Only the ≥1000px layout
// reads it — below that the sidebar is an always-closed overlay drawer.

const STORAGE_KEY = "skb:sidebar-open";

let snapshot: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    // Anything but an explicit "0" means open — fail toward showing the
    // sidebar.
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function getSidebarOpen(): boolean {
  snapshot ??= read();
  return snapshot;
}

/**
 * Always open — the server can't read storage, and a sidebar that folds away
 * post-hydration is less jarring than a shell that grows a sidebar.
 */
export function getServerSidebarOpen(): boolean {
  return true;
}

export function subscribeSidebarOpen(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function setSidebarOpen(next: boolean): void {
  if (getSidebarOpen() === next) return;
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Storage full or blocked — the in-memory snapshot holds until reload.
  }
  for (const listener of listeners) listener();
}

export function toggleSidebarOpen(): void {
  setSidebarOpen(!getSidebarOpen());
}
