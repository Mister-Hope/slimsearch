import type { SearchIndex } from "./SearchIndex.js";
import type { AnyObject, EmptyObject } from "./typings.js";

/**
 * Check if a document with the given ID is present in the index
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param searchIndex The search index
 * @param id  The document ID
 *
 * @returns `true` if a document with the given ID is present in the index and
 * available for search, `false` otherwise
 */
export const has = <ID, Document, Index extends AnyObject = EmptyObject>(
  searchIndex: SearchIndex<ID, Document, Index>,
  id: ID,
): boolean => searchIndex._idToShortId.has(id);

/**
 * Returns the stored fields (as configured in the `storeFields` constructor
 * option) for the given document ID. Returns `undefined` if the document is
 * not present in the index.
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param searchIndex The search index
 * @param id  The document ID
 * @returns The stored document index
 */
export const getStoredFields = <ID, Document, Index extends AnyObject = EmptyObject>(
  searchIndex: SearchIndex<ID, Document, Index>,
  id: ID,
): Index | undefined => {
  const shortId = searchIndex._idToShortId.get(id);

  // oxlint-disable-next-line no-undefined
  if (shortId == null) return undefined;

  return searchIndex._storedFields.get(shortId);
};
