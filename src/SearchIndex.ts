import { SearchableMap } from "./SearchableMap/SearchableMap.js";
import {
  defaultAutoSuggestOptions,
  defaultAutoVacuumOptions,
  defaultOptions,
  defaultSearchOptions,
  defaultVacuumConditions,
} from "./defaults.js";
import {
  type DocumentTermFrequencies,
  type SearchOptionsWithDefaults,
} from "./results.js";
import {
  type AutoVacuumOptions,
  type IndexObject,
  type LogLevel,
  type SearchIndexOptions,
  type SearchOptions,
  type SerializedIndexEntry,
  type VacuumConditions,
} from "./typings.js";

interface OptionsWithDefaults<
  ID = any,
  Document = any,
  Index extends Record<string, any> = Record<string, never>,
> extends Omit<
    SearchIndexOptions<ID, Document, Index>,
    "processTerm" | "tokenize"
  > {
  storeFields: string[];

  idField: string;

  extractField: (document: Document, fieldName: string) => string;

  tokenize: (text: string, fieldName: string) => string[];

  processTerm: (
    term: string,
    fieldName: string,
  ) => string | string[] | null | undefined | false;

  logger: (level: LogLevel, message: string, code?: string) => void;

  autoVacuum: false | AutoVacuumOptions;

  searchOptions: SearchOptionsWithDefaults<ID, Index>;

  autoSuggestOptions: SearchOptions<ID, Index>;
}

export type FieldTermData = Map<number, DocumentTermFrequencies>;

/**
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * ### Basic example:
 *
 * ```js
 * const documents = [
 *   {
 *     id: 1,
 *     title: 'Moby Dick',
 *     text: 'Call me Ishmael. Some years ago...',
 *     category: 'fiction'
 *   },
 *   {
 *     id: 2,
 *     title: 'Zen and the Art of Motorcycle Maintenance',
 *     text: 'I can see by my watch...',
 *     category: 'fiction'
 *   },
 *   {
 *     id: 3,
 *     title: 'Neuromancer',
 *     text: 'The sky above the port was...',
 *     category: 'fiction'
 *   },
 *   {
 *     id: 4,
 *     title: 'Zen and the Art of Archery',
 *     text: 'At first sight it must seem...',
 *     category: 'non-fiction'
 *   },
 *   // ...and more
 * ]
 *
 * // Create a search engine that indexes the 'title' and 'text' fields for
 * // full-text search. Search results will include 'title' and 'category' (plus the
 * // id field, that is always stored and returned)
 * const searchIndex = createIndex({
 *   fields: ['title', 'text'],
 *   storeFields: ['title', 'category']
 * })
 *
 * // Add documents to the index
 * addAll(searchIndex, documents)
 *
 * // Search for documents:
 * const results = search(searchIndex, 'zen art motorcycle')
 * // => [
 * //   { id: 2, title: 'Zen and the Art of Motorcycle Maintenance', category: 'fiction', score: 2.77258 },
 * //   { id: 4, title: 'Zen and the Art of Archery', category: 'non-fiction', score: 1.38629 }
 * // ]
 * ```
 */
export class SearchIndex<
  ID = any,
  Document = any,
  Index extends Record<string, any> = Record<never, never>,
> {
  _options: OptionsWithDefaults<ID, Document, Index>;
  _index: SearchableMap<FieldTermData>;
  _documentCount: number;
  _documentIds: Map<number, ID>;
  _idToShortId: Map<ID, number>;
  _fieldIds: { [key: string]: number };
  _fieldLength: Map<number, number[]>;
  _avgFieldLength: number[];
  _nextId: number;
  _storedFields: Map<number, Index>;
  _dirtCount: number;
  _currentVacuum: Promise<void> | null;
  _enqueuedVacuum: Promise<void> | null;
  _enqueuedVacuumConditions: VacuumConditions | undefined;

  constructor(options: SearchIndexOptions<ID, Document, Index>) {
    if (options?.fields == null)
      throw new Error('SlimSearch: option "fields" must be provided');

    const autoVacuum =
      options.autoVacuum == null || options.autoVacuum === true
        ? defaultAutoVacuumOptions
        : options.autoVacuum;

    // @ts-ignore
    this._options = {
      ...defaultOptions,
      ...options,
      autoVacuum,
      searchOptions: {
        ...defaultSearchOptions,
        ...(options.searchOptions || {}),
      },
      autoSuggestOptions: {
        ...defaultAutoSuggestOptions,
        ...(options.autoSuggestOptions || {}),
      },
    };

    this._index = new SearchableMap();

    this._documentCount = 0;

    this._documentIds = new Map();

    this._idToShortId = new Map();

    // Fields are defined during initialization, don't change, are few in
    // number, rarely need iterating over, and have string keys. Therefore in
    // this case an object is a better candidate than a Map to store the mapping
    // from field key to ID.
    this._fieldIds = {};

    this._fieldLength = new Map();

    this._avgFieldLength = [];

    this._nextId = 0;

    this._storedFields = new Map();

    this._dirtCount = 0;

    this._currentVacuum = null;

    this._enqueuedVacuum = null;
    this._enqueuedVacuumConditions = defaultVacuumConditions;

    this.addFields(this._options.fields);
  }

  /**
   * Is `true` if a vacuuming operation is ongoing, `false` otherwise
   */
  get isVacuuming(): boolean {
    return this._currentVacuum != null;
  }

  /**
   * The number of documents discarded since the most recent vacuuming
   */
  get dirtCount(): number {
    return this._dirtCount;
  }

  /**
   * A number between 0 and 1 giving an indication about the proportion of
   * documents that are discarded, and can therefore be cleaned up by vacuuming.
   * A value close to 0 means that the index is relatively clean, while a higher
   * value means that the index is relatively dirty, and vacuuming could release
   * memory.
   */
  get dirtFactor(): number {
    return this._dirtCount / (1 + this._documentCount + this._dirtCount);
  }

  /**
   * Total number of documents available to search
   */
  get documentCount(): number {
    return this._documentCount;
  }

  /**
   * Number of terms in the index
   */
  get termCount(): number {
    return this._index.size;
  }

  /**
   * Allows serialization of the index to JSON, to possibly store it and later
   * deserialize it with `loadJSONIndex`.
   *
   * Normally one does not directly call this method, but rather call the
   * standard JavaScript `JSON.stringify()` passing the `SearchIndex` instance,
   * and JavaScript will internally call this method. Upon deserialization, one
   * must pass to `loadJSONIndex` the same options used to create the original
   * instance that was serialized.
   *
   * ### Usage:
   *
   * ```js
   * // Serialize the index:
   * let searchIndex = createIndex({ fields: ['title', 'text'] })
   * addAll(searchIndex, documents)
   * const json = JSON.stringify(index)
   *
   * // Later, to deserialize it:
   * searchIndex = loadJSONIndex(json, { fields: ['title', 'text'] })
   * ```
   *
   * @return A plain-object serializable representation of the search index.
   */
  toJSON(): IndexObject<Index> {
    const index: [string, { [key: string]: SerializedIndexEntry }][] = [];

    for (const [term, fieldIndex] of this._index) {
      const data: { [key: string]: SerializedIndexEntry } = {};

      for (const [fieldId, frequencies] of fieldIndex)
        data[fieldId] = Object.fromEntries(frequencies);

      index.push([term, data]);
    }

    return {
      documentCount: this._documentCount,
      nextId: this._nextId,
      documentIds: Object.fromEntries(this._documentIds),
      fieldIds: this._fieldIds,
      fieldLength: Object.fromEntries(this._fieldLength),
      averageFieldLength: this._avgFieldLength,
      storedFields: Object.fromEntries(this._storedFields),
      dirtCount: this._dirtCount,
      index,
      serializationVersion: 2,
    };
  }

  /**
   * @ignore
   */
  private addFields(fields: string[]): void {
    for (let i = 0; i < fields.length; i++) this._fieldIds[fields[i]] = i;
  }
}
