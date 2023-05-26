import { type SearchIndex } from "./SearchIndex.js";

/**
 * Returns `true` if a document with the given ID is present in the index and
 * available for search, `false` otherwise
 *
 * @param searchIndex The search Index
 * @param id  The document ID
 */
export const has = <Document, ID>(
  searchIndex: SearchIndex<Document>,
  id: ID
): boolean => searchIndex._idToShortId.has(id);

/**
 * Returns the stored fields (as configured in the `storeFields` constructor
 * option) for the given document ID. Returns `undefined` if the document is
 * not present in the index.
 *
 * @param searchIndex The search Index
 * @param id  The document ID
 */
export const getStoredFields = <Document, ID>(
  searchIndex: SearchIndex<Document>,
  id: ID
): Record<string, unknown> | undefined => {
  const shortId = searchIndex._idToShortId.get(id);

  if (shortId == null) return undefined;

  return searchIndex._storedFields.get(shortId);
};
