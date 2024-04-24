/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FieldTermData } from "./SearchIndex.js";
import { SearchIndex } from "./SearchIndex.js";
import { SearchableMap } from "./SearchableMap/SearchableMap.js";
import type { DocumentTermFrequencies } from "./results.js";
import type {
  IndexObject,
  SearchIndexOptions,
  SerializedIndexEntry,
} from "./typings.js";
import { objectToNumericMap } from "./utils.js";

/**
 * @param options  Configuration options
 *
 * ### Examples:
 *
 * ```js
 * // Create a search engine that indexes the 'title' and 'text' fields of your
 * // documents:
 * const searchIndex = createIndex({ fields: ['title', 'text'] })
 * ```
 *
 * ### ID Field:
 *
 * ```js
 * // Your documents are assumed to include a unique 'id' field, but if you want
 * // to use a different field for document identification, you can set the
 * // 'idField' option:
 * const searchIndex = createIndex({ idField: 'key', fields: ['title', 'text'] })
 * ```
 *
 * ### Options and defaults:
 *
 * ```js
 * // The full set of options (here with their default value) is:
 * const searchIndex = createIndex({
 *   // idField: field that uniquely identifies a document
 *   idField: 'id',
 *
 *   // extractField: function used to get the value of a field in a document.
 *   // By default, it assumes the document is a flat object with field names as
 *   // property keys and field values as string property values, but custom logic
 *   // can be implemented by setting this option to a custom extractor function.
 *   extractField: (document, fieldName) => document[fieldName],
 *
 *   // tokenize: function used to split fields into individual terms. By
 *   // default, it is also used to tokenize search queries, unless a specific
 *   // `tokenize` search option is supplied. When tokenizing an indexed field,
 *   // the field name is passed as the second argument.
 *   tokenize: (string, _fieldName) => string.split(SPACE_OR_PUNCTUATION),
 *
 *   // processTerm: function used to process each tokenized term before
 *   // indexing. It can be used for stemming and normalization. Return a falsy
 *   // value in order to discard a term. By default, it is also used to process
 *   // search queries, unless a specific `processTerm` option is supplied as a
 *   // search option. When processing a term from a indexed field, the field
 *   // name is passed as the second argument.
 *   processTerm: (term, _fieldName) => term.toLowerCase(),
 *
 *   // searchOptions: default search options, see the `search` method for
 *   // details
 *   searchOptions: undefined,
 *
 *   // fields: document fields to be indexed. Mandatory, but not set by default
 *   fields: undefined
 *
 *   // storeFields: document fields to be stored and returned as part of the
 *   // search results.
 *   storeFields: []
 * })
 * ```
 */
export const createIndex = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  options: SearchIndexOptions<ID, Document, Index>,
): SearchIndex<ID, Document, Index> => new SearchIndex(options);

export const loadIndex = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  {
    index,
    documentCount,
    nextId,
    documentIds,
    fieldIds,
    fieldLength,
    averageFieldLength,
    storedFields,
    dirtCount,
    serializationVersion,
  }: IndexObject<Index>,
  options: SearchIndexOptions<ID, Document, Index>,
): SearchIndex<ID, Document, Index> => {
  if (serializationVersion !== 1 && serializationVersion !== 2)
    throw new Error(
      "SlimSearch: cannot deserialize an index created with an incompatible version",
    );

  const searchIndex = new SearchIndex(options);

  searchIndex._documentCount = documentCount;
  searchIndex._nextId = nextId;
  searchIndex._documentIds = objectToNumericMap<ID>(documentIds);
  searchIndex._idToShortId = new Map<ID, number>();
  searchIndex._fieldIds = fieldIds;
  searchIndex._fieldLength = objectToNumericMap(fieldLength);
  searchIndex._avgFieldLength = averageFieldLength;
  searchIndex._storedFields = objectToNumericMap(storedFields);
  searchIndex._dirtCount = dirtCount ?? 0;
  searchIndex._index = new SearchableMap();

  for (const [shortId, id] of searchIndex._documentIds)
    searchIndex._idToShortId.set(id, shortId);

  for (const [term, data] of index) {
    const dataMap = new Map() as FieldTermData;

    for (const fieldId of Object.keys(data)) {
      let indexEntry = data[fieldId];

      // Version 1 used to nest the index entry inside a field called ds
      if (serializationVersion === 1)
        indexEntry = indexEntry.ds as unknown as SerializedIndexEntry;

      dataMap.set(
        parseInt(fieldId, 10),
        objectToNumericMap(indexEntry) as DocumentTermFrequencies,
      );
    }

    searchIndex._index.set(term, dataMap);
  }

  return searchIndex;
};

/**
 * Deserializes a JSON index (serialized with `JSON.stringify(index)`)
 * and instantiates a SearchIndex instance. It should be given the same options
 * originally used when serializing the index.
 *
 * ### Usage:
 *
 * ```js
 * // If the index was serialized with:
 * let index = createIndex({ fields: ['title', 'text'] })
 *
 * addAll(index, documents)
 *
 * const json = JSON.stringify(index)
 * // It can later be deserialized like this:
 * index = loadJSONIndex(json, { fields: ['title', 'text'] })
 * ```
 *
 * @param json  JSON-serialized index
 * @param options  configuration options, same as the constructor
 * @return An instance of SearchIndex deserialized from the given JSON.
 */
export const loadJSONIndex = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  json: string,
  options: SearchIndexOptions<ID, Document, Index>,
): SearchIndex<ID, Document, Index> => {
  if (options == null)
    throw new Error(
      "SlimSearch: loadJSON should be given the same options used when serializing the index",
    );

  return loadIndex(JSON.parse(json) as IndexObject<Index>, options);
};
