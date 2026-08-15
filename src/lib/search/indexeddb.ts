"use client";

import { createStore, get, set } from "idb-keyval";

// Dedicated store, separate from the default idb-keyval store the autosave
// draft cache uses, so the two mechanisms' keys don't share a namespace.
const store = createStore("skb", "search-cache");

const INDEX_KEY = "index-json";
const FINGERPRINT_KEY = "fingerprint";

export async function loadCachedIndex(): Promise<
  { json: string; fingerprint: string } | undefined
> {
  const [json, fingerprint] = await Promise.all([
    get<string>(INDEX_KEY, store),
    get<string>(FINGERPRINT_KEY, store),
  ]);
  if (!json || !fingerprint) return undefined;
  return { json, fingerprint };
}

export async function saveIndexCache(
  json: string,
  fingerprint: string,
): Promise<void> {
  await Promise.all([
    set(INDEX_KEY, json, store),
    set(FINGERPRINT_KEY, fingerprint, store),
  ]);
}
