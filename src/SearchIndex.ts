import { SearchableMap } from "./SearchableMap/SearchableMap.js";
import {
  defaultAutoSuggestOptions,
  defaultAutoVacuumOptions,
  defaultOptions,
  defaultSearchOptions,
  defaultVacuumConditions,
} from "./defaults.js";
import {
  type DocumentTermFreqs,
  type SearchOptionsWithDefaults,
} from "./results.js";
import {
  type AsPlainObject,
  type AutoVacuumOptions,
  type LogLevel,
  type Options,
  type SearchOptions,
  type SerializedIndexEntry,
  type VacuumConditions,
} from "./typings.js";

type OptionsWithDefaults<T = any> = Options<T> & {
  storeFields: string[];

  idField: string;

  extractField: (document: T, fieldName: string) => string;

  tokenize: (text: string, fieldName: string) => string[];

  processTerm: (
    term: string,
    fieldName: string
  ) => string | string[] | null | undefined | false;

  logger: (level: LogLevel, message: string, code?: string) => void;

  autoVacuum: false | AutoVacuumOptions;

  searchOptions: SearchOptionsWithDefaults;

  autoSuggestOptions: SearchOptions;
};

export type FieldTermData = Map<number, DocumentTermFreqs>;

/**
 * [[MiniSearch]] is the main entrypoint class, implementing a full-text search
 * engine in memory.
 *
 * @typeParam T  The type of the documents being indexed.
 *
 * ### Basic example:
 *
 * ```javascript
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
 * const index = createIndex(({
 *   fields: ['title', 'text'],
 *   storeFields: ['title', 'category']
 * })
 *
 * // Add documents to the index
 * addAll(index, documents)
 *
 * // Search for documents:
 * let results = search(index, 'zen art motorcycle')
 * // => [
 * //   { id: 2, title: 'Zen and the Art of Motorcycle Maintenance', category: 'fiction', score: 2.77258 },
 * //   { id: 4, title: 'Zen and the Art of Archery', category: 'non-fiction', score: 1.38629 }
 * // ]
 * ```
 */
export class SearchIndex<T = any> {
  // protected _options: OptionsWithDefaults<T>;
  _options: OptionsWithDefaults<T>;
  // protected _index: SearchableMap<FieldTermData>;
  _index: SearchableMap<FieldTermData>;
  // protected _documentCount: number;
  _documentCount: number;
  // protected _documentIds: Map<number, any>;
  _documentIds: Map<number, any>;
  // protected _idToShortId: Map<any, number>;
  _idToShortId: Map<any, number>;
  // protected _fieldIds: { [key: string]: number };
  _fieldIds: { [key: string]: number };
  // protected _fieldLength: Map<number, number[]>;
  _fieldLength: Map<number, number[]>;
  // protected _avgFieldLength: number[];
  _avgFieldLength: number[];
  // protected _nextId: number;
  _nextId: number;
  // protected _storedFields: Map<number, Record<string, unknown>>;
  _storedFields: Map<number, Record<string, unknown>>;
  // protected _dirtCount: number;
  _dirtCount: number;
  // private _currentVacuum: Promise<void> | null;
  _currentVacuum: Promise<void> | null;
  // private _enqueuedVacuum: Promise<void> | null;
  _enqueuedVacuum: Promise<void> | null;
  // private _enqueuedVacuumConditions: VacuumConditions | undefined;
  _enqueuedVacuumConditions: VacuumConditions | undefined;

  constructor(options: Options<T>) {
    if (options?.fields == null)
      throw new Error('MiniSearch: option "fields" must be provided');

    const autoVacuum =
      options.autoVacuum == null || options.autoVacuum === true
        ? defaultAutoVacuumOptions
        : options.autoVacuum;

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
   * deserialize it with `MiniSearch.loadJSON`.
   *
   * Normally one does not directly call this method, but rather call the
   * standard JavaScript `JSON.stringify()` passing the `MiniSearch` instance,
   * and JavaScript will internally call this method. Upon deserialization, one
   * must pass to `loadJSON` the same options used to create the original
   * instance that was serialized.
   *
   * ### Usage:
   *
   * ```javascript
   * // Serialize the index:
   * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * miniSearch.addAll(documents)
   * const json = JSON.stringify(miniSearch)
   *
   * // Later, to deserialize it:
   * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
   * ```
   *
   * @return A plain-object serializable representation of the search index.
   */
  toJSON(): AsPlainObject {
    const index: [string, { [key: string]: SerializedIndexEntry }][] = [];

    for (const [term, fieldIndex] of this._index) {
      const data: { [key: string]: SerializedIndexEntry } = {};

      for (const [fieldId, freqs] of fieldIndex)
        data[fieldId] = Object.fromEntries(freqs);

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
