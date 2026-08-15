import MiniSearch, { type Options } from "minisearch";

export type NoteDoc = {
  id: string;
  slug: string;
  title: string;
  bodyMd: string;
  tags: string[];
  updatedAt: string;
};

export const SEARCH_INDEX_OPTIONS: Options<NoteDoc> = {
  idField: "id",
  fields: ["title", "bodyMd", "tags"],
  storeFields: ["slug", "title", "tags", "updatedAt"],
};

export function createSearchIndex(): MiniSearch<NoteDoc> {
  return new MiniSearch<NoteDoc>(SEARCH_INDEX_OPTIONS);
}
