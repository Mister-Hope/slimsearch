import { type SearchIndex } from "./SearchIndex.js";

/**
 * Returns `true` if a document with the given ID is present in the index and
 * available for search, `false` otherwise
 *
 * @param index The search Index
 * @param id  The document ID
 */
export const has = <T>(index: SearchIndex<T>, id: any): boolean =>
  index._idToShortId.has(id);

/**
 * Returns the stored fields (as configured in the `storeFields` constructor
 * option) for the given document ID. Returns `undefined` if the document is
 * not present in the index.
 *
 * @param index The search Index
 * @param id  The document ID
 */
export const getStoredFields = <T>(
  index: SearchIndex<T>,
  id: any
): Record<string, unknown> | undefined => {
  const shortId = index._idToShortId.get(id);

  if (shortId == null) return undefined;

  return index._storedFields.get(shortId);
};
