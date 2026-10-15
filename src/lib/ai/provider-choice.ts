// The AI provider last picked in the menu, in a `useSyncExternalStore` store
// (like [tag preferences]) so it survives navigation between notes. Local
// storage, so the last one used is the one the menu opens on next time.

const STORAGE_KEY = "skb:ai-provider";

// A primitive, so `getSnapshot` is referentially stable for free.
let snapshot: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked (Safari private mode).
    return null;
  }
}

export function getProviderChoice(): string | null {
  // A `loaded` flag, not `snapshot ??=` — "nothing stored" is a real answer.
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
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // In-memory snapshot still carries it across navigations in this tab.
  }
  for (const onChange of listeners) onChange();
}
