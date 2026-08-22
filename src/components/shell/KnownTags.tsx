"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Every tag name in use, shared with whatever needs to know what already
 * exists.
 *
 * The layout already flattens the tag tree for the palette, so the list costs
 * nothing extra — what it doesn't have is a way down to the pane, since the
 * pages render as `children` rather than as descendants the shell can pass
 * props to. A context is the one path that reaches both sides of the shell:
 * the rail, which has the tree already, and the index view, which has only the
 * notes of the tag it is showing.
 *
 * Empty outside the shell (the login page renders without one), which is the
 * honest answer there rather than a crash: nothing that consumes this can ask
 * about tags on a page that has none.
 */
const KnownTagsContext = createContext<string[]>([]);

export function KnownTagsProvider({
  tags,
  children,
}: {
  tags: string[];
  children: ReactNode;
}) {
  return (
    <KnownTagsContext.Provider value={tags}>
      {children}
    </KnownTagsContext.Provider>
  );
}

/** Every tag in use, as written — ancestors included, since the tree has rows for them. */
export function useKnownTags(): string[] {
  return useContext(KnownTagsContext);
}
