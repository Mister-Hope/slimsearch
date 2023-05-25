import { type SearchIndex } from "./SearchIndex.js";
import { has } from "./info.js";
import { addTerm } from "./term.js";

const addFieldLength = <T>(
  index: SearchIndex<T>,
  documentId: number,
  fieldId: number,
  count: number,
  length: number
): void => {
  let fieldLengths = index._fieldLength.get(documentId);

  if (fieldLengths == null)
    index._fieldLength.set(documentId, (fieldLengths = []));
  fieldLengths[fieldId] = length;

  const averageFieldLength = index._avgFieldLength[fieldId] || 0;
  const totalFieldLength = averageFieldLength * count + length;

  index._avgFieldLength[fieldId] = totalFieldLength / (count + 1);
};

const addDocumentId = <T>(index: SearchIndex<T>, documentId: any): number => {
  const shortDocumentId = index._nextId;

  index._idToShortId.set(documentId, shortDocumentId);
  index._documentIds.set(shortDocumentId, documentId);
  index._documentCount += 1;
  index._nextId += 1;

  return shortDocumentId;
};

const saveStoredFields = <T>(
  index: SearchIndex<T>,
  documentId: number,
  doc: T
): void => {
  const { storeFields, extractField } = index._options;

  if (storeFields == null || storeFields.length === 0) return;

  let documentFields = index._storedFields.get(documentId);

  if (documentFields == null)
    index._storedFields.set(documentId, (documentFields = {}));

  for (const fieldName of storeFields) {
    const fieldValue = extractField(doc, fieldName);

    if (fieldValue !== undefined) documentFields[fieldName] = fieldValue;
  }
};

/**
 * Adds a document to the index
 *
 * @param index  The search index
 * @param document  The document to be indexed
 */
export const add = <T>(index: SearchIndex<T>, document: T): void => {
  const { extractField, tokenize, processTerm, fields, idField } =
    index._options;
  const id = extractField(document, idField);

  if (id == null)
    throw new Error(`MiniSearch: document does not have ID field "${idField}"`);

  if (has(index, id)) throw new Error(`MiniSearch: duplicate ID ${id}`);

  const shortDocumentId = addDocumentId(index, id);

  saveStoredFields(index, shortDocumentId, document);

  for (const field of fields) {
    const fieldValue = extractField(document, field);

    if (fieldValue == null) continue;

    const tokens = tokenize(fieldValue.toString(), field);
    const fieldId = index._fieldIds[field];

    const uniqueTerms = new Set(tokens).size;

    addFieldLength(
      index,
      shortDocumentId,
      fieldId,
      index._documentCount - 1,
      uniqueTerms
    );

    for (const term of tokens) {
      const processedTerm = processTerm(term, field);

      if (Array.isArray(processedTerm))
        for (const t of processedTerm)
          addTerm(index, fieldId, shortDocumentId, t);
      else if (processedTerm)
        addTerm(index, fieldId, shortDocumentId, processedTerm);
    }
  }
};

/**
 * Adds all the given documents to the index
 *
 * @param index  The search index
 * @param documents  An array of documents to be indexed
 */
export const addAll = <T>(
  index: SearchIndex<T>,
  documents: readonly T[]
): void => {
  for (const document of documents) add(index, document);
};

/**
 * Adds all the given documents to the index asynchronously.
 *
 * Returns a promise that resolves (to `undefined`) when the indexing is done.
 * This method is useful when index many documents, to avoid blocking the main
 * thread. The indexing is performed asynchronously and in chunks.
 *
 * @param index  The search index
 * @param documents  An array of documents to be indexed
 * @param options  Configuration options
 * @return A promise resolving to `undefined` when the indexing is done
 */
export const addAllAsync = <T>(
  index: SearchIndex<T>,
  documents: readonly T[],
  options: { chunkSize?: number } = {}
): Promise<void> => {
  const { chunkSize = 10 } = options;
  const acc: { chunk: T[]; promise: Promise<void> } = {
    chunk: [],
    promise: Promise.resolve(),
  };

  const { chunk, promise } = documents.reduce(
    ({ chunk, promise }, document: T, i: number) => {
      chunk.push(document);
      if ((i + 1) % chunkSize === 0)
        return {
          chunk: [],
          promise: promise
            .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
            .then(() => addAll(index, chunk)),
        };
      else return { chunk, promise };
    },
    acc
  );

  return promise.then(() => addAll(index, chunk));
};
