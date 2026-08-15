// The AI provider the user picked, kept outside React so it survives moving
// between notes — each note mounts a fresh NoteEditor, and a choice that reset
// on every navigation would have to be re-made constantly.
//
// Same external-store shape as [list-state], and for the same two reasons:
// sessionStorage doesn't exist during the server render, and restoring in an
// effect is what `useSyncExternalStore` exists to replace. sessionStorage
// rather than local: which model you're asking is a property of what you're
// doing right now, not a durable preference.

const STORAGE_KEY = "skb:ai-provider";

// A primitive, so `getSnapshot` is referentially stable for free — no frozen
// object needed here, unlike the list state.
let snapshot: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked (Safari private mode) — the choice just won't outlive
    // this page load.
    return null;
  }
}

export function getProviderChoice(): string | null {
  // A `loaded` flag rather than `snapshot ??=`: "nothing stored" is a real
  // answer, and null would otherwise re-hit storage on every render.
  if (!loaded) {
    loaded = true;
    snapshot = read();
  }
  return snapshot;
}

/** Always null: the server has no session to read a choice from. */
export function getServerProviderChoice(): string | null {
  return null;
}

export function subscribeProviderChoice(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setProviderChoice(id: string): void {
  loaded = true;
  snapshot = id;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // In-memory snapshot still carries it across navigations in this tab.
  }
  for (const onChange of listeners) onChange();
}
