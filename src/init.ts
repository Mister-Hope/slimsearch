import type { FieldTermData } from "./SearchIndex.js";
import { SearchIndex } from "./SearchIndex.js";
import { SearchableMap } from "./SearchableMap/index.js";
import type { DocumentTermFrequencies } from "./results.js";
import type { IndexObject, SearchIndexOptions } from "./typings.js";
import { objectToNumericMap, objectToNumericMapAsync, wait } from "./utils.js";

const getMsg = (method: string): string =>
  `SlimSearch: ${method} should be given the same options used when serializing the index`;

/**
 * Create search index with given options
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param options Configuration options
 * @returns A instance of SearchIndex with given options
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

const instantiateIndex = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  {
    documentCount,
    nextId,
    fieldIds,
    averageFieldLength,
    dirtCount,
    version,
  }: IndexObject<Index>,
  options: SearchIndexOptions<ID, Document, Index>,
): SearchIndex<ID, Document, Index> => {
  if (version !== 2) {
    throw new Error(
      "SlimSearch: cannot deserialize an index created with an incompatible version",
    );
  }

  const searchIndex = createIndex(options);

  searchIndex._documentCount = documentCount;
  searchIndex._nextId = nextId;
  searchIndex._idToShortId = new Map<ID, number>();
  searchIndex._fieldIds = fieldIds;
  searchIndex._avgFieldLength = averageFieldLength;
  searchIndex._dirtCount = dirtCount ?? 0;
  searchIndex._index = new SearchableMap();

  return searchIndex;
};

/**
 * Instantiates a SearchIndex instance from a JS Object.
 * It should be given the same options originally used when serializing the index.
 *
 * ### Usage:
 *
 * ```js
 * // If the index was serialized with:
 * let index = createIndex({ fields: ['title', 'text'] })
 *
 * addAll(index, documents)
 *
 * const json = index.toJSON()
 * // It can later be loaded like this:
 * index = loadJSON(json, { fields: ['title', 'text'] })
 * ```
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param indexObject index object
 * @param options  configuration options, same as the constructor
 * @return An instance of SearchIndex deserialized from the given JS object.
 */
export const loadIndex = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  indexObject: IndexObject<Index>,
  options: SearchIndexOptions<ID, Document, Index>,
): SearchIndex<ID, Document, Index> => {
  const { index, documentIds, fieldLength, storedFields } = indexObject;

  const searchIndex = instantiateIndex(indexObject, options);

  searchIndex._documentIds = objectToNumericMap<ID>(documentIds);
  searchIndex._fieldLength = objectToNumericMap(fieldLength);
  searchIndex._storedFields = objectToNumericMap(storedFields);

  for (const [shortId, id] of searchIndex._documentIds)
    searchIndex._idToShortId.set(id, shortId);

  for (const [term, data] of index) {
    const dataMap = new Map() as FieldTermData;

    for (const fieldId of Object.keys(data))
      dataMap.set(
        parseInt(fieldId, 10),
        objectToNumericMap(data[fieldId]) as DocumentTermFrequencies,
      );

    searchIndex._index.set(term, dataMap);
  }

  return searchIndex;
};

/**
 * Async equivalent of {@link loadIndex}
 *
 * This function is an alternative to {@link loadIndex} that returns
 * a promise, and loads the index in batches, leaving pauses between them to avoid
 * blocking the main thread. It tends to be slower than the synchronous
 * version, but does not block the main thread, so it can be a better choice
 * when deserializing very large indexes.
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param indexObject index object
 * @param options  configuration options, same as the constructor
 * @return A Promise that will resolve to an instance of MiniSearch deserialized from the given JSON.
 */
export const loadIndexAsync = async <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  indexObject: IndexObject<Index>,
  options: SearchIndexOptions<ID, Document, Index>,
): Promise<SearchIndex<ID, Document, Index>> => {
  const { index, documentIds, fieldLength, storedFields } = indexObject;
  const searchIndex = instantiateIndex(indexObject, options);

  searchIndex._documentIds = await objectToNumericMapAsync<ID>(documentIds);
  searchIndex._fieldLength = await objectToNumericMapAsync(fieldLength);
  searchIndex._storedFields = await objectToNumericMapAsync(storedFields);

  for (const [shortId, id] of searchIndex._documentIds)
    searchIndex._idToShortId.set(id, shortId);

  let count = 0;

  for (const [term, data] of index) {
    const dataMap = new Map() as FieldTermData;

    for (const fieldId of Object.keys(data))
      dataMap.set(
        parseInt(fieldId, 10),
        (await objectToNumericMapAsync(
          data[fieldId],
        )) as DocumentTermFrequencies,
      );

    if (++count % 1000 === 0) await wait(0);

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
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!options) throw new Error(getMsg("loadJSONIndex"));

  return loadIndex(JSON.parse(json) as IndexObject<Index>, options);
};

/**
 * Async equivalent of {@link loadJSONIndex}
 *
 * This function is an alternative to {@link loadJSONIndex} that returns
 * a promise, and loads the index in batches, leaving pauses between them to avoid
 * blocking the main thread. It tends to be slower than the synchronous
 * version, but does not block the main thread, so it can be a better choice
 * when deserializing very large indexes.
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param json  JSON-serialized index
 * @param options  configuration options, same as the constructor
 * @return A Promise that will resolve to an instance of MiniSearch deserialized from the given JSON.
 */
export const loadJSONIndexAsync = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  json: string,
  options: SearchIndexOptions<ID, Document, Index>,
): Promise<SearchIndex<ID, Document, Index>> => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!options) throw new Error(getMsg("loadJSONIndexAsync"));

  return loadIndexAsync(JSON.parse(json) as IndexObject<Index>, options);
};
