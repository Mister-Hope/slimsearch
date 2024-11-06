import type { SearchIndex } from "./SearchIndex.js";
import { createMap } from "./utils.js";
import { warnDocumentChanged } from "./warning.js";

/**
 * @private
 */
export const addTerm = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  fieldId: number,
  documentId: number,
  term: string,
): void => {
  const indexData = searchIndex._index.fetch(term, createMap);

  let fieldIndex = indexData.get(fieldId);

  if (fieldIndex == null) {
    fieldIndex = new Map();
    fieldIndex.set(documentId, 1);
    indexData.set(fieldId, fieldIndex);
  } else {
    const docs = fieldIndex.get(documentId);

    fieldIndex.set(documentId, (docs ?? 0) + 1);
  }
};

/**
 * @private
 */
export const removeTerm = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
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

  if (fieldIndex?.get(documentId) == null)
    warnDocumentChanged(searchIndex, documentId, fieldId, term);
  else if (fieldIndex.get(documentId)! <= 1)
    if (fieldIndex.size <= 1) indexData.delete(fieldId);
    else fieldIndex.delete(documentId);
  else fieldIndex.set(documentId, fieldIndex.get(documentId)! - 1);

  if (searchIndex._index.get(term)!.size === 0) searchIndex._index.delete(term);
};
