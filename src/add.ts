import type { SearchIndex } from "./SearchIndex.js";
import { has } from "./info.js";
import { addTerm } from "./term.js";

const addFieldLength = <ID, Document, Index extends Record<string, any> = Record<never, never>>(
  searchIndex: SearchIndex<ID, Document, Index>,
  documentId: number,
  fieldId: number,
  count: number,
  length: number,
): void => {
  let fieldLengths = searchIndex._fieldLength.get(documentId);

  if (fieldLengths == null) searchIndex._fieldLength.set(documentId, (fieldLengths = []));
  fieldLengths[fieldId] = length;

  const averageFieldLength = searchIndex._avgFieldLength[fieldId] || 0;
  const totalFieldLength = averageFieldLength * count + length;

  searchIndex._avgFieldLength[fieldId] = totalFieldLength / (count + 1);
};

const addDocumentId = <ID, Document, Index extends Record<string, any> = Record<never, never>>(
  searchIndex: SearchIndex<ID, Document, Index>,
  documentId: ID,
): number => {
  const shortDocumentId = searchIndex._nextId;

  searchIndex._idToShortId.set(documentId, shortDocumentId);
  searchIndex._documentIds.set(shortDocumentId, documentId);
  searchIndex._documentCount += 1;
  searchIndex._nextId += 1;

  return shortDocumentId;
};

const saveStoredFields = <ID, Document, Index extends Record<string, any> = Record<never, never>>(
  searchIndex: SearchIndex<ID, Document, Index>,
  documentId: number,
  doc: Document,
): void => {
  const { storeFields, extractField } = searchIndex._options;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (storeFields?.length === 0) return;

  let documentFields: Record<string, unknown> | undefined =
    searchIndex._storedFields.get(documentId);

  if (documentFields === undefined)
    searchIndex._storedFields.set(documentId, (documentFields = {} as Index));

  for (const fieldName of storeFields) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const fieldValue = extractField(doc, fieldName);

    if (fieldValue != null) documentFields[fieldName] = fieldValue;
  }
};

/**
 * Adds a document to the index
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param searchIndex  The search index
 * @param document  The document to be indexed
 */
export const add = <ID, Document, Index extends Record<string, any> = Record<never, never>>(
  searchIndex: SearchIndex<ID, Document, Index>,
  document: Document,
): void => {
  const { extractField, stringifyField, tokenize, processTerm, fields, idField } =
    searchIndex._options;
  const id = extractField(document, idField) as ID;

  if (id == null) throw new Error(`SlimSearch: document does not have ID field "${idField}"`);

  if (has(searchIndex, id)) throw new Error(`SlimSearch: duplicate ID ${id as string}`);

  const shortDocumentId = addDocumentId(searchIndex, id);

  saveStoredFields(searchIndex, shortDocumentId, document);

  for (const field of fields) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const fieldValue = extractField(document, field);

    if (fieldValue == null) continue;

    const tokens = tokenize(stringifyField(fieldValue, field), field);
    const fieldId = searchIndex._fieldIds[field];

    const uniqueTerms = new Set(tokens).size;

    addFieldLength(
      searchIndex,
      shortDocumentId,
      fieldId,
      searchIndex._documentCount - 1,
      uniqueTerms,
    );

    for (const term of tokens) {
      const processedTerm = processTerm(term, field);

      if (Array.isArray(processedTerm))
        for (const t of processedTerm) addTerm(searchIndex, fieldId, shortDocumentId, t);
      else if (processedTerm) addTerm(searchIndex, fieldId, shortDocumentId, processedTerm);
    }
  }
};

/**
 * Adds all the given documents to the index
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param searchIndex  The search index
 * @param documents  An array of documents to be indexed
 */
export const addAll = <ID, Document, Index extends Record<string, any> = Record<never, never>>(
  searchIndex: SearchIndex<ID, Document, Index>,
  documents: readonly Document[],
): void => {
  for (const document of documents) add(searchIndex, document);
};

/**
 * Adds all the given documents to the index asynchronously.
 *
 * Returns a promise that resolves (to `undefined`) when the indexing is done.
 * This method is useful when index many documents, to avoid blocking the main
 * thread. The indexing is performed asynchronously and in chunks.
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param searchIndex  The search index
 * @param documents  An array of documents to be indexed
 * @param options  Configuration options
 * @return A promise resolving when the indexing is done
 */
export const addAllAsync = <ID, Document, Index extends Record<string, any> = Record<never, never>>(
  searchIndex: SearchIndex<ID, Document, Index>,
  documents: readonly Document[],
  options: { chunkSize?: number } = {},
): Promise<void> => {
  const { chunkSize = 10 } = options;
  const acc: { chunk: Document[]; promise: Promise<void> } = {
    chunk: [],
    promise: Promise.resolve(),
  };

  const { chunk, promise } = documents.reduce(({ chunk, promise }, document, index) => {
    chunk.push(document);
    if ((index + 1) % chunkSize === 0)
      return {
        chunk: [],
        promise: promise
          .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
          .then(() => addAll(searchIndex, chunk)),
      };

    return { chunk, promise };
  }, acc);

  return promise.then(() => addAll(searchIndex, chunk));
};
