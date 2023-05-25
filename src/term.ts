import { type MiniSearch } from "./MiniSearch.js";
import { warnDocumentChanged } from "./warning.js";
import { createMap } from "./utils.js";

/**
 * @ignore
 */
export const addTerm = (
  index: MiniSearch,
  fieldId: number,
  documentId: number,
  term: string
): void => {
  const indexData = index._index.fetch(term, createMap);

  let fieldIndex = indexData.get(fieldId);

  if (fieldIndex == null) {
    fieldIndex = new Map();
    fieldIndex.set(documentId, 1);
    indexData.set(fieldId, fieldIndex);
  } else {
    const docs = fieldIndex.get(documentId);

    fieldIndex.set(documentId, (docs || 0) + 1);
  }
};

export const removeTerm = (
  index: MiniSearch,
  fieldId: number,
  documentId: number,
  term: string
): void => {
  if (!index._index.has(term)) {
    warnDocumentChanged(index, documentId, fieldId, term);

    return;
  }

  const indexData = index._index.fetch(term, createMap);

  const fieldIndex = indexData.get(fieldId);

  if (fieldIndex == null || fieldIndex.get(documentId) == null)
    warnDocumentChanged(index, documentId, fieldId, term);
  else if (fieldIndex.get(documentId)! <= 1)
    if (fieldIndex.size <= 1) indexData.delete(fieldId);
    else fieldIndex.delete(documentId);
  else fieldIndex.set(documentId, fieldIndex.get(documentId)! - 1);

  if (index._index.get(term)!.size === 0) index._index.delete(term);
};
