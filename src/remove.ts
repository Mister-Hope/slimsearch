import { type SearchIndex } from "./SearchIndex.js";
import { SearchableMap } from "./SearchableMap/SearchableMap.js";
import { removeTerm } from "./term.js";
import { maybeAutoVacuum } from "./vacuum.js";

const removeFieldLength = <T>(
  index: SearchIndex<T>,
  fieldId: number,
  count: number,
  length: number
): void => {
  if (count === 1) {
    index._avgFieldLength[fieldId] = 0;

    return;
  }

  const totalFieldLength = index._avgFieldLength[fieldId] * count - length;

  index._avgFieldLength[fieldId] = totalFieldLength / (count - 1);
};

/**
 * Discards the document with the given ID, so it won't appear in search results
 *
 * It has the same visible effect of [[remove]] (both cause the
 * document to stop appearing in searches), but a different effect on the
 * internal data structures:
 *
 *   - [[remove]] requires passing the full document to be removed
 *   as argument, and removes it from the inverted index immediately.
 *
 *   - [[discard]] instead only needs the document ID, and works by
 *   marking the current version of the document as discarded, so it is
 *   immediately ignored by searches. This is faster and more convenient than
 *   `remove`, but the index is not immediately modified. To take care of
 *   that, vacuuming is performed after a certain number of documents are
 *   discarded, cleaning up the index and allowing memory to be released.
 *
 * After discarding a document, it is possible to re-add a new version, and
 * only the new version will appear in searches. In other words, discarding
 * and re-adding a document works exactly like removing and re-adding it. The
 * [[replace]] method can also be used to replace a document with a
 * new version.
 *
 * #### Details about vacuuming
 *
 * Repetite calls to this method would leave obsolete document references in
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
 *   `autoVacuum` field in [[Options]]) after a certain number of documents
 *   are discarded. Vacuuming traverses all terms in the index, cleaning up
 *   all references to discarded documents. Vacuuming can also be triggered
 *   manually by calling [[vacuum]].
 *
 * @param index The search Index
 * @param id  The ID of the document to be discarded
 */
export const discard = <T>(index: SearchIndex<T>, id: any): void => {
  const shortId = index._idToShortId.get(id);

  if (shortId == null)
    throw new Error(
      `MiniSearch: cannot discard document with ID ${id}: it is not in the index`
    );

  index._idToShortId.delete(id);
  index._documentIds.delete(shortId);
  index._storedFields.delete(shortId);
  (index._fieldLength.get(shortId) || []).forEach((fieldLength, fieldId) => {
    removeFieldLength(index, fieldId, index._documentCount, fieldLength);
  });

  index._fieldLength.delete(shortId);

  index._documentCount -= 1;
  index._dirtCount += 1;

  maybeAutoVacuum(index);
};

/**
 * Discards the documents with the given IDs, so they won't appear in search
 * results
 *
 * It is equivalent to calling [[discard]] for all the given IDs,
 * but with the optimization of triggering at most one automatic vacuuming at
 * the end.
 *
 * Note: to remove all documents from the index, it is faster and more
 * convenient to call [[removeAll]] with no argument, instead of
 * passing all IDs to this method.
 */
export const discardAll = <T>(
  index: SearchIndex<T>,
  ids: readonly any[]
): void => {
  const autoVacuum = index._options.autoVacuum;

  try {
    index._options.autoVacuum = false;

    for (const id of ids) discard(index, id);
  } finally {
    index._options.autoVacuum = autoVacuum;
  }

  maybeAutoVacuum(index);
};

/**
 * Removes the given document from the index.
 *
 * The document to remove must NOT have changed between indexing and removal,
 * otherwise the index will be corrupted.
 *
 * This method requires passing the full document to be removed (not just the
 * ID), and immediately removes the document from the inverted index, allowing
 * memory to be released. A convenient alternative is [[discard]],
 * which needs only the document ID, and has the same visible effect, but
 * delays cleaning up the index until the next vacuuming.
 *
 * @param index The search Index
 * @param document  The document to be removed
 */
export const remove = <T>(index: SearchIndex<T>, document: T): void => {
  const { tokenize, processTerm, extractField, fields, idField } =
    index._options;
  const id = extractField(document, idField);

  if (id == null)
    throw new Error(`MiniSearch: document does not have ID field "${idField}"`);

  const shortId = index._idToShortId.get(id);

  if (shortId == null)
    throw new Error(
      `MiniSearch: cannot remove document with ID ${id}: it is not in the index`
    );

  for (const field of fields) {
    const fieldValue = extractField(document, field);

    if (fieldValue == null) continue;

    const tokens = tokenize(fieldValue.toString(), field);
    const fieldId = index._fieldIds[field];

    const uniqueTerms = new Set(tokens).size;

    removeFieldLength(index, fieldId, index._documentCount, uniqueTerms);

    for (const term of tokens) {
      const processedTerm = processTerm(term, field);

      if (Array.isArray(processedTerm))
        for (const t of processedTerm) removeTerm(index, fieldId, shortId, t);
      else if (processedTerm)
        removeTerm(index, fieldId, shortId, processedTerm);
    }
  }

  index._storedFields.delete(shortId);
  index._documentIds.delete(shortId);
  index._idToShortId.delete(id);
  index._fieldLength.delete(shortId);
  index._documentCount -= 1;
};

/**
 * Removes all the given documents from the index. If called with no arguments,
 * it removes _all_ documents from the index.
 *
 * @param index The search Index
 * @param documents  The documents to be removed. If this argument is omitted,
 * all documents are removed. Note that, for removing all documents, it is
 * more efficient to call this method with no arguments than to pass all
 * documents.
 */
export const removeAll = function removeAll<T>(
  index: SearchIndex<T>,
  documents?: readonly T[]
): void {
  if (documents) {
    for (const document of documents) remove(index, document);
  } else if (arguments.length > 1) {
    throw new Error(
      "Expected documents to be present. Omit the argument to remove all documents."
    );
  } else {
    index._index = new SearchableMap();
    index._documentCount = 0;
    index._documentIds = new Map();
    index._idToShortId = new Map();
    index._fieldLength = new Map();
    index._avgFieldLength = [];
    index._storedFields = new Map();
    index._nextId = 0;
  }
};
