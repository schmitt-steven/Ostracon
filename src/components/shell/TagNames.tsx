"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Every tag name in use, via context — the one path from the shell (which has
 * the flattened tree) down to pages rendered as `children`. Empty outside the
 * shell (the login page).
 */
const TagNamesContext = createContext<string[]>([]);

export function TagNamesProvider({
  tags,
  children,
}: {
  tags: string[];
  children: ReactNode;
}) {
  return (
    <TagNamesContext.Provider value={tags}>
      {children}
    </TagNamesContext.Provider>
  );
}

/** Every tag in use, as written — ancestors included, since the tree has rows for them. */
export function useTagNames(): string[] {
  return useContext(TagNamesContext);
}
