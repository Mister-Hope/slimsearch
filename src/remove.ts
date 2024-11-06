import type { SearchIndex } from "./SearchIndex.js";
import { SearchableMap } from "./SearchableMap/index.js";
import { removeTerm } from "./term.js";
import { maybeAutoVacuum } from "./vacuum.js";

const removeFieldLength = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  fieldId: number,
  count: number,
  length: number,
): void => {
  if (count === 1) {
    searchIndex._avgFieldLength[fieldId] = 0;

    return;
  }

  const totalFieldLength =
    searchIndex._avgFieldLength[fieldId] * count - length;

  searchIndex._avgFieldLength[fieldId] = totalFieldLength / (count - 1);
};

/**
 * Discards the document with the given ID, so it won't appear in search results
 *
 * It has the same visible effect of {@link remove} (both cause the
 * document to stop appearing in searches), but a different effect on the
 * internal data structures:
 *
 *   - {@link remove} requires passing the full document to be removed
 *   as argument, and removes it from the inverted index immediately.
 *
 *   - {@link discard} instead only needs the document ID, and works by
 *   marking the current version of the document as discarded, so it is
 *   immediately ignored by searches. This is faster and more convenient than
 *   `remove`, but the index is not immediately modified. To take care of
 *   that, vacuuming is performed after a certain number of documents are
 *   discarded, cleaning up the index and allowing memory to be released.
 *
 * After discarding a document, it is possible to re-add a new version, and
 * only the new version will appear in searches. In other words, discarding
 * and re-adding a document works exactly like removing and re-adding it. The
 * {@link replace} method can also be used to replace a document with a
 * new version.
 *
 * #### Details about vacuuming
 *
 * Repetitive calls to this method would leave obsolete document references in
 * the index, invisible to searches. Two mechanisms take care of cleaning up:
 * clean up during search, and vacuuming.
 *
 *   - Upon search, whenever a discarded ID is found (and ignored for the
 *   results), references to the discarded document are removed from the
 *   inverted index entries for the search terms. This ensures that subsequent
 *   searches for the same terms do not need to skip these obsolete references
 *   again.
 *
 *   - In addition, vacuuming is performed automatically by default (see the
 *   `autoVacuum` field in {@link SearchOptions}) after a certain number of documents
 *   are discarded. Vacuuming traverses all terms in the index, cleaning up
 *   all references to discarded documents. Vacuuming can also be triggered
 *   manually by calling {@link vacuum}.
 *
 * @param searchIndex The search Index
 * @param id  The ID of the document to be discarded
 */
export const discard = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  id: ID,
): void => {
  const shortId = searchIndex._idToShortId.get(id);

  if (shortId == null)
    throw new Error(
      `SlimSearch: cannot discard document with ID ${id as string}: it is not in the index`,
    );

  searchIndex._idToShortId.delete(id);
  searchIndex._documentIds.delete(shortId);
  searchIndex._storedFields.delete(shortId);
  searchIndex._fieldLength.get(shortId)?.forEach((fieldLength, fieldId) => {
    removeFieldLength(
      searchIndex,
      fieldId,
      searchIndex._documentCount,
      fieldLength,
    );
  });

  searchIndex._fieldLength.delete(shortId);

  searchIndex._documentCount -= 1;
  searchIndex._dirtCount += 1;

  maybeAutoVacuum(searchIndex);
};

/**
 * Discards the documents with the given IDs, so they won't appear in search
 * results
 *
 * It is equivalent to calling {@link discard} for all the given IDs,
 * but with the optimization of triggering at most one automatic vacuuming at
 * the end.
 *
 * Note: to remove all documents from the index, it is faster and more
 * convenient to call {@link removeAll} with no argument, instead of
 * passing all IDs to this method.
 */
export const discardAll = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  ids: readonly ID[],
): void => {
  const autoVacuum = searchIndex._options.autoVacuum;

  try {
    searchIndex._options.autoVacuum = false;

    for (const id of ids) discard(searchIndex, id);
  } finally {
    searchIndex._options.autoVacuum = autoVacuum;
  }

  maybeAutoVacuum(searchIndex);
};

/**
 * Removes the given document from the index.
 *
 * The document to remove must NOT have changed between indexing and removal,
 * otherwise the index will be corrupted.
 *
 * This method requires passing the full document to be removed (not just the
 * ID), and immediately removes the document from the inverted index, allowing
 * memory to be released. A convenient alternative is {@link discard},
 * which needs only the document ID, and has the same visible effect, but
 * delays cleaning up the index until the next vacuuming.
 *
 * @param searchIndex The search Index
 * @param document  The document to be removed
 */
export const remove = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  document: Document,
): void => {
  const { tokenize, processTerm, extractField, fields, idField } =
    searchIndex._options;
  const id = extractField(document, idField) as ID;

  if (id == null)
    throw new Error(`SlimSearch: document does not have ID field "${idField}"`);

  const shortId = searchIndex._idToShortId.get(id);

  if (shortId == null)
    throw new Error(
      `SlimSearch: cannot remove document with ID ${id as string}: it is not in the index`,
    );

  for (const field of fields) {
    const fieldValue = extractField(document, field);

    if (fieldValue == null) continue;

    const tokens = tokenize(fieldValue.toString(), field);
    const fieldId = searchIndex._fieldIds[field];

    const uniqueTerms = new Set(tokens).size;

    removeFieldLength(
      searchIndex,
      fieldId,
      searchIndex._documentCount,
      uniqueTerms,
    );

    for (const term of tokens) {
      const processedTerm = processTerm(term, field);

      if (Array.isArray(processedTerm))
        for (const t of processedTerm)
          removeTerm(searchIndex, fieldId, shortId, t);
      else if (processedTerm)
        removeTerm(searchIndex, fieldId, shortId, processedTerm);
    }
  }

  searchIndex._storedFields.delete(shortId);
  searchIndex._documentIds.delete(shortId);
  searchIndex._idToShortId.delete(id);
  searchIndex._fieldLength.delete(shortId);
  searchIndex._documentCount -= 1;
};

/**
 * Removes all the given documents from the index. If called with no arguments,
 * it removes _all_ documents from the index.
 *
 * @param searchIndex The search Index
 * @param documents  The documents to be removed. If this argument is omitted,
 * all documents are removed. Note that, for removing all documents, it is
 * more efficient to call this method with no arguments than to pass all
 * documents.
 */
export const removeAll = function removeAll<
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  documents?: readonly Document[],
): void {
  if (documents) {
    for (const document of documents) remove(searchIndex, document);
  } else if (arguments.length > 1) {
    throw new Error(
      "Expected documents to be present. Omit the argument to remove all documents.",
    );
  } else {
    searchIndex._index = new SearchableMap();
    searchIndex._documentCount = 0;
    searchIndex._documentIds = new Map();
    searchIndex._idToShortId = new Map();
    searchIndex._fieldLength = new Map();
    searchIndex._avgFieldLength = [];
    searchIndex._storedFields = new Map();
    searchIndex._nextId = 0;
  }
};
