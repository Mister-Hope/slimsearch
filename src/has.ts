import { type MiniSearch } from "./MiniSearch.js";

/**
 * Returns `true` if a document with the given ID is present in the index and
 * available for search, `false` otherwise
 *
 * @param id  The document ID
 */
export const has = <T>(index: MiniSearch<T>, id: any): boolean =>
  index._idToShortId.has(id);
