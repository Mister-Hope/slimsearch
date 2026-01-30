import type { SearchIndex } from "./SearchIndex.js";
import { createMap } from "./utils.js";
import { warnDocumentChanged } from "./warning.js";
import type { AnyObject, EmptyObject } from "./typings.js";

/**
 * Adds the given term to the index for the given field and document
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param searchIndex The search index
 * @param fieldId The field ID
 * @param documentId The document short ID
 * @param term The term to be added
 *
 * @private
 */
export const addTerm = <ID, Document, Index extends AnyObject = EmptyObject>(
  searchIndex: SearchIndex<ID, Document, Index>,
  fieldId: number,
  documentId: number,
  term: string,
): void => {
  const indexData = searchIndex._index.fetch(term, createMap);

  let fieldIndex = indexData.get(fieldId);

  if (fieldIndex == null) {
    fieldIndex = new Map([[documentId, 1]]);
    indexData.set(fieldId, fieldIndex);
  } else {
    const docs = fieldIndex.get(documentId);

    fieldIndex.set(documentId, (docs ?? 0) + 1);
  }
};

/**
 * Removes the given term from the index for the given field and document
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param searchIndex The search index
 * @param fieldId The field ID
 * @param documentId The document short ID
 * @param term The term to be removed
 *
 * @private
 */
export const removeTerm = <ID, Document, Index extends AnyObject = EmptyObject>(
  searchIndex: SearchIndex<ID, Document, Index>,
  fieldId: number,
  documentId: number,
  term: string,
): void => {
  if (!searchIndex._index.has(term)) {
    warnDocumentChanged(searchIndex, documentId, fieldId, term);

    return;
  }

  const indexData = searchIndex._index.fetch(term, createMap);

  const fieldIndex = indexData.get(fieldId);

  const amount = fieldIndex?.get(documentId);

  if (!fieldIndex || amount == null) warnDocumentChanged(searchIndex, documentId, fieldId, term);
  else if (amount <= 1)
    if (fieldIndex.size <= 1) indexData.delete(fieldId);
    else fieldIndex.delete(documentId);
  else fieldIndex.set(documentId, amount - 1);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (searchIndex._index.get(term)!.size === 0) searchIndex._index.delete(term);
};
