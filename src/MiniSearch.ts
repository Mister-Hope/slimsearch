import { SearchableMap } from "./SearchableMap/SearchableMap.js";
import { OR } from "./constant.js";
import {
  defaultAutoSuggestOptions,
  defaultAutoVacuumOptions,
  defaultOptions,
  defaultSearchOptions,
  defaultVacuumConditions,
  defaultVacuumOptions,
} from "./defaults.js";
import {
  type AsPlainObject,
  type AutoVacuumOptions,
  type BM25Params,
  type LogLevel,
  type Options,
  type Query,
  type SearchOptions,
  type SearchResult,
  type SerializedIndexEntry,
  type Suggestion,
  type VacuumConditions,
  type VacuumOptions,
} from "./typings.js";
import {
  type QuerySpec,
  type RawResult,
  assignUniqueTerm,
  byScore,
  calcBM25Score,
  combinators,
  createMap,
  getOwnProperty,
  objectToNumericMap,
  termToQuerySpec,
} from "./utils.js";

type SearchOptionsWithDefaults = SearchOptions & {
  boost: { [fieldName: string]: number };

  weights: { fuzzy: number; prefix: number };

  prefix: boolean | ((term: string, index: number, terms: string[]) => boolean);

  fuzzy:
    | boolean
    | number
    | ((term: string, index: number, terms: string[]) => boolean | number);

  maxFuzzy: number;

  combineWith: string;

  bm25: BM25Params;
};

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

type DocumentTermFreqs = Map<number, number>;

type FieldTermData = Map<number, DocumentTermFreqs>;

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
 * const miniSearch = new MiniSearch({
 *   fields: ['title', 'text'],
 *   storeFields: ['title', 'category']
 * })
 *
 * // Add documents to the index
 * miniSearch.addAll(documents)
 *
 * // Search for documents:
 * let results = miniSearch.search('zen art motorcycle')
 * // => [
 * //   { id: 2, title: 'Zen and the Art of Motorcycle Maintenance', category: 'fiction', score: 2.77258 },
 * //   { id: 4, title: 'Zen and the Art of Archery', category: 'non-fiction', score: 1.38629 }
 * // ]
 * ```
 */
export class MiniSearch<T = any> {
  protected _options: OptionsWithDefaults<T>;
  protected _index: SearchableMap<FieldTermData>;
  protected _documentCount: number;
  protected _documentIds: Map<number, any>;
  protected _idToShortId: Map<any, number>;
  protected _fieldIds: { [key: string]: number };
  protected _fieldLength: Map<number, number[]>;
  protected _avgFieldLength: number[];
  protected _nextId: number;
  protected _storedFields: Map<number, Record<string, unknown>>;
  protected _dirtCount: number;
  private _currentVacuum: Promise<void> | null;
  private _enqueuedVacuum: Promise<void> | null;
  private _enqueuedVacuumConditions: VacuumConditions | undefined;

  /**
   * @param options  Configuration options
   *
   * ### Examples:
   *
   * ```javascript
   * // Create a search engine that indexes the 'title' and 'text' fields of your
   * // documents:
   * const miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * ```
   *
   * ### ID Field:
   *
   * ```javascript
   * // Your documents are assumed to include a unique 'id' field, but if you want
   * // to use a different field for document identification, you can set the
   * // 'idField' option:
   * const miniSearch = new MiniSearch({ idField: 'key', fields: ['title', 'text'] })
   * ```
   *
   * ### Options and defaults:
   *
   * ```javascript
   * // The full set of options (here with their default value) is:
   * const miniSearch = new MiniSearch({
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
   * Adds a document to the index
   *
   * @param document  The document to be indexed
   */
  add(document: T): void {
    const { extractField, tokenize, processTerm, fields, idField } =
      this._options;
    const id = extractField(document, idField);

    if (id == null)
      throw new Error(
        `MiniSearch: document does not have ID field "${idField}"`
      );

    if (this._idToShortId.has(id))
      throw new Error(`MiniSearch: duplicate ID ${id}`);

    const shortDocumentId = this.addDocumentId(id);

    this.saveStoredFields(shortDocumentId, document);

    for (const field of fields) {
      const fieldValue = extractField(document, field);

      if (fieldValue == null) continue;

      const tokens = tokenize(fieldValue.toString(), field);
      const fieldId = this._fieldIds[field];

      const uniqueTerms = new Set(tokens).size;

      this.addFieldLength(
        shortDocumentId,
        fieldId,
        this._documentCount - 1,
        uniqueTerms
      );

      for (const term of tokens) {
        const processedTerm = processTerm(term, field);

        if (Array.isArray(processedTerm))
          for (const t of processedTerm)
            this.addTerm(fieldId, shortDocumentId, t);
        else if (processedTerm)
          this.addTerm(fieldId, shortDocumentId, processedTerm);
      }
    }
  }

  /**
   * Adds all the given documents to the index
   *
   * @param documents  An array of documents to be indexed
   */
  addAll(documents: readonly T[]): void {
    for (const document of documents) this.add(document);
  }

  /**
   * Adds all the given documents to the index asynchronously.
   *
   * Returns a promise that resolves (to `undefined`) when the indexing is done.
   * This method is useful when index many documents, to avoid blocking the main
   * thread. The indexing is performed asynchronously and in chunks.
   *
   * @param documents  An array of documents to be indexed
   * @param options  Configuration options
   * @return A promise resolving to `undefined` when the indexing is done
   */
  addAllAsync(
    documents: readonly T[],
    options: { chunkSize?: number } = {}
  ): Promise<void> {
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
              .then(() => this.addAll(chunk)),
          };
        else return { chunk, promise };
      },
      acc
    );

    return promise.then(() => this.addAll(chunk));
  }

  /**
   * Removes the given document from the index.
   *
   * The document to remove must NOT have changed between indexing and removal,
   * otherwise the index will be corrupted.
   *
   * This method requires passing the full document to be removed (not just the
   * ID), and immediately removes the document from the inverted index, allowing
   * memory to be released. A convenient alternative is [[MiniSearch.discard]],
   * which needs only the document ID, and has the same visible effect, but
   * delays cleaning up the index until the next vacuuming.
   *
   * @param document  The document to be removed
   */
  remove(document: T): void {
    const { tokenize, processTerm, extractField, fields, idField } =
      this._options;
    const id = extractField(document, idField);

    if (id == null)
      throw new Error(
        `MiniSearch: document does not have ID field "${idField}"`
      );

    const shortId = this._idToShortId.get(id);

    if (shortId == null)
      throw new Error(
        `MiniSearch: cannot remove document with ID ${id}: it is not in the index`
      );

    for (const field of fields) {
      const fieldValue = extractField(document, field);

      if (fieldValue == null) continue;

      const tokens = tokenize(fieldValue.toString(), field);
      const fieldId = this._fieldIds[field];

      const uniqueTerms = new Set(tokens).size;

      this.removeFieldLength(
        shortId,
        fieldId,
        this._documentCount,
        uniqueTerms
      );

      for (const term of tokens) {
        const processedTerm = processTerm(term, field);

        if (Array.isArray(processedTerm))
          for (const t of processedTerm) this.removeTerm(fieldId, shortId, t);
        else if (processedTerm)
          this.removeTerm(fieldId, shortId, processedTerm);
      }
    }

    this._storedFields.delete(shortId);
    this._documentIds.delete(shortId);
    this._idToShortId.delete(id);
    this._fieldLength.delete(shortId);
    this._documentCount -= 1;
  }

  /**
   * Removes all the given documents from the index. If called with no arguments,
   * it removes _all_ documents from the index.
   *
   * @param documents  The documents to be removed. If this argument is omitted,
   * all documents are removed. Note that, for removing all documents, it is
   * more efficient to call this method with no arguments than to pass all
   * documents.
   */
  removeAll(documents?: readonly T[]): void {
    if (documents) {
      for (const document of documents) this.remove(document);
    } else if (arguments.length > 0) {
      throw new Error(
        "Expected documents to be present. Omit the argument to remove all documents."
      );
    } else {
      this._index = new SearchableMap();
      this._documentCount = 0;
      this._documentIds = new Map();
      this._idToShortId = new Map();
      this._fieldLength = new Map();
      this._avgFieldLength = [];
      this._storedFields = new Map();
      this._nextId = 0;
    }
  }

  /**
   * Discards the document with the given ID, so it won't appear in search results
   *
   * It has the same visible effect of [[MiniSearch.remove]] (both cause the
   * document to stop appearing in searches), but a different effect on the
   * internal data structures:
   *
   *   - [[MiniSearch.remove]] requires passing the full document to be removed
   *   as argument, and removes it from the inverted index immediately.
   *
   *   - [[MiniSearch.discard]] instead only needs the document ID, and works by
   *   marking the current version of the document as discarded, so it is
   *   immediately ignored by searches. This is faster and more convenient than
   *   `remove`, but the index is not immediately modified. To take care of
   *   that, vacuuming is performed after a certain number of documents are
   *   discarded, cleaning up the index and allowing memory to be released.
   *
   * After discarding a document, it is possible to re-add a new version, and
   * only the new version will appear in searches. In other words, discarding
   * and re-adding a document works exactly like removing and re-adding it. The
   * [[MiniSearch.replace]] method can also be used to replace a document with a
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
   *   manually by calling [[MiniSearch.vacuum]].
   *
   * @param id  The ID of the document to be discarded
   */
  discard(id: any): void {
    const shortId = this._idToShortId.get(id);

    if (shortId == null)
      throw new Error(
        `MiniSearch: cannot discard document with ID ${id}: it is not in the index`
      );

    this._idToShortId.delete(id);
    this._documentIds.delete(shortId);
    this._storedFields.delete(shortId);
    (this._fieldLength.get(shortId) || []).forEach((fieldLength, fieldId) => {
      this.removeFieldLength(
        shortId,
        fieldId,
        this._documentCount,
        fieldLength
      );
    });

    this._fieldLength.delete(shortId);

    this._documentCount -= 1;
    this._dirtCount += 1;

    this.maybeAutoVacuum();
  }

  private maybeAutoVacuum(): void {
    if (this._options.autoVacuum === false) return;

    const { minDirtFactor, minDirtCount, batchSize, batchWait } =
      this._options.autoVacuum;

    this.conditionalVacuum(
      { batchSize, batchWait },
      { minDirtCount, minDirtFactor }
    );
  }

  /**
   * Discards the documents with the given IDs, so they won't appear in search
   * results
   *
   * It is equivalent to calling [[MiniSearch.discard]] for all the given IDs,
   * but with the optimization of triggering at most one automatic vacuuming at
   * the end.
   *
   * Note: to remove all documents from the index, it is faster and more
   * convenient to call [[MiniSearch.removeAll]] with no argument, instead of
   * passing all IDs to this method.
   */
  discardAll(ids: readonly any[]): void {
    const autoVacuum = this._options.autoVacuum;

    try {
      this._options.autoVacuum = false;

      for (const id of ids) this.discard(id);
    } finally {
      this._options.autoVacuum = autoVacuum;
    }

    this.maybeAutoVacuum();
  }

  /**
   * It replaces an existing document with the given updated version
   *
   * It works by discarding the current version and adding the updated one, so
   * it is functionally equivalent to calling [[MiniSearch.discard]] followed by
   * [[MiniSearch.add]]. The ID of the updated document should be the same as
   * the original one.
   *
   * Since it uses [[MiniSearch.discard]] internally, this method relies on
   * vacuuming to clean up obsolete document references from the index, allowing
   * memory to be released (see [[MiniSearch.discard]]).
   *
   * @param updatedDocument  The updated document to replace the old version
   * with
   */
  replace(updatedDocument: T): void {
    const { idField, extractField } = this._options;
    const id = extractField(updatedDocument, idField);

    this.discard(id);
    this.add(updatedDocument);
  }

  /**
   * Triggers a manual vacuuming, cleaning up references to discarded documents
   * from the inverted index
   *
   * Vacuuming is only useful for applications that use the
   * [[MiniSearch.discard]] or [[MiniSearch.replace]] methods.
   *
   * By default, vacuuming is performed automatically when needed (controlled by
   * the `autoVacuum` field in [[Options]]), so there is usually no need to call
   * this method, unless one wants to make sure to perform vacuuming at a
   * specific moment.
   *
   * Vacuuming traverses all terms in the inverted index in batches, and cleans
   * up references to discarded documents from the posting list, allowing memory
   * to be released.
   *
   * The method takes an optional object as argument with the following keys:
   *
   *   - `batchSize`: the size of each batch (1000 by default)
   *
   *   - `batchWait`: the number of milliseconds to wait between batches (10 by
   *   default)
   *
   * On large indexes, vacuuming could have a non-negligible cost: batching
   * avoids blocking the thread for long, diluting this cost so that it is not
   * negatively affecting the application. Nonetheless, this method should only
   * be called when necessary, and relying on automatic vacuuming is usually
   * better.
   *
   * It returns a promise that resolves (to undefined) when the clean up is
   * completed. If vacuuming is already ongoing at the time this method is
   * called, a new one is enqueued immediately after the ongoing one, and a
   * corresponding promise is returned. However, no more than one vacuuming is
   * enqueued on top of the ongoing one, even if this method is called more
   * times (enqueuing multiple ones would be useless).
   *
   * @param options  Configuration options for the batch size and delay. See
   * [[VacuumOptions]].
   */
  vacuum(options: VacuumOptions = {}): Promise<void> {
    return this.conditionalVacuum(options);
  }

  private conditionalVacuum(
    options: VacuumOptions,
    conditions?: VacuumConditions
  ): Promise<void> {
    // If a vacuum is already ongoing, schedule another as soon as it finishes,
    // unless there's already one enqueued. If one was already enqueued, do not
    // enqueue another on top, but make sure that the conditions are the
    // broadest.
    if (this._currentVacuum) {
      this._enqueuedVacuumConditions =
        this._enqueuedVacuumConditions && conditions;
      if (this._enqueuedVacuum != null) return this._enqueuedVacuum;

      this._enqueuedVacuum = this._currentVacuum.then(() => {
        const conditions = this._enqueuedVacuumConditions;

        this._enqueuedVacuumConditions = defaultVacuumConditions;

        return this.performVacuuming(options, conditions);
      });

      return this._enqueuedVacuum;
    }

    if (this.vacuumConditionsMet(conditions) === false)
      return Promise.resolve();

    this._currentVacuum = this.performVacuuming(options);

    return this._currentVacuum;
  }

  private async performVacuuming(
    options: VacuumOptions,
    conditions?: VacuumConditions
  ): Promise<void> {
    const initialDirtCount = this._dirtCount;

    if (this.vacuumConditionsMet(conditions)) {
      const batchSize = options.batchSize || defaultVacuumOptions.batchSize;
      const batchWait = options.batchWait || defaultVacuumOptions.batchWait;
      let i = 1;

      for (const [term, fieldsData] of this._index) {
        for (const [fieldId, fieldIndex] of fieldsData)
          for (const [shortId] of fieldIndex) {
            if (this._documentIds.has(shortId)) continue;

            if (fieldIndex.size <= 1) fieldsData.delete(fieldId);
            else fieldIndex.delete(shortId);
          }

        if (this._index.get(term)!.size === 0) this._index.delete(term);

        if (i % batchSize === 0)
          await new Promise((resolve) => setTimeout(resolve, batchWait));

        i += 1;
      }

      this._dirtCount -= initialDirtCount;
    }

    // Make the next lines always async, so they execute after this function returns
    await null;

    this._currentVacuum = this._enqueuedVacuum;
    this._enqueuedVacuum = null;
  }

  private vacuumConditionsMet(conditions?: VacuumConditions) {
    if (conditions == null) return true;

    let { minDirtCount, minDirtFactor } = conditions;

    minDirtCount = minDirtCount || defaultAutoVacuumOptions.minDirtCount;
    minDirtFactor = minDirtFactor || defaultAutoVacuumOptions.minDirtFactor;

    return this.dirtCount >= minDirtCount && this.dirtFactor >= minDirtFactor;
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
   * Returns `true` if a document with the given ID is present in the index and
   * available for search, `false` otherwise
   *
   * @param id  The document ID
   */
  has(id: any): boolean {
    return this._idToShortId.has(id);
  }

  /**
   * Returns the stored fields (as configured in the `storeFields` constructor
   * option) for the given document ID. Returns `undefined` if the document is
   * not present in the index.
   *
   * @param id  The document ID
   */
  getStoredFields(id: any): Record<string, unknown> | undefined {
    const shortId = this._idToShortId.get(id);

    if (shortId == null) return undefined;

    return this._storedFields.get(shortId);
  }

  /**
   * Search for documents matching the given search query.
   *
   * The result is a list of scored document IDs matching the query, sorted by
   * descending score, and each including data about which terms were matched and
   * in which fields.
   *
   * ### Basic usage:
   *
   * ```javascript
   * // Search for "zen art motorcycle" with default options: terms have to match
   * // exactly, and individual terms are joined with OR
   * miniSearch.search('zen art motorcycle')
   * // => [ { id: 2, score: 2.77258, match: { ... } }, { id: 4, score: 1.38629, match: { ... } } ]
   * ```
   *
   * ### Restrict search to specific fields:
   *
   * ```javascript
   * // Search only in the 'title' field
   * miniSearch.search('zen', { fields: ['title'] })
   * ```
   *
   * ### Field boosting:
   *
   * ```javascript
   * // Boost a field
   * miniSearch.search('zen', { boost: { title: 2 } })
   * ```
   *
   * ### Prefix search:
   *
   * ```javascript
   * // Search for "moto" with prefix search (it will match documents
   * // containing terms that start with "moto" or "neuro")
   * miniSearch.search('moto neuro', { prefix: true })
   * ```
   *
   * ### Fuzzy search:
   *
   * ```javascript
   * // Search for "ismael" with fuzzy search (it will match documents containing
   * // terms similar to "ismael", with a maximum edit distance of 0.2 term.length
   * // (rounded to nearest integer)
   * miniSearch.search('ismael', { fuzzy: 0.2 })
   * ```
   *
   * ### Combining strategies:
   *
   * ```javascript
   * // Mix of exact match, prefix search, and fuzzy search
   * miniSearch.search('ismael mob', {
   *  prefix: true,
   *  fuzzy: 0.2
   * })
   * ```
   *
   * ### Advanced prefix and fuzzy search:
   *
   * ```javascript
   * // Perform fuzzy and prefix search depending on the search term. Here
   * // performing prefix and fuzzy search only on terms longer than 3 characters
   * miniSearch.search('ismael mob', {
   *  prefix: term => term.length > 3
   *  fuzzy: term => term.length > 3 ? 0.2 : null
   * })
   * ```
   *
   * ### Combine with AND:
   *
   * ```javascript
   * // Combine search terms with AND (to match only documents that contain both
   * // "motorcycle" and "art")
   * miniSearch.search('motorcycle art', { combineWith: 'AND' })
   * ```
   *
   * ### Combine with AND_NOT:
   *
   * There is also an AND_NOT combinator, that finds documents that match the
   * first term, but do not match any of the other terms. This combinator is
   * rarely useful with simple queries, and is meant to be used with advanced
   * query combinations (see later for more details).
   *
   * ### Filtering results:
   *
   * ```javascript
   * // Filter only results in the 'fiction' category (assuming that 'category'
   * // is a stored field)
   * miniSearch.search('motorcycle art', {
   *   filter: (result) => result.category === 'fiction'
   * })
   * ```
   *
   * ### Advanced combination of queries:
   *
   * It is possible to combine different subqueries with OR, AND, and AND_NOT,
   * and even with different search options, by passing a query expression
   * tree object as the first argument, instead of a string.
   *
   * ```javascript
   * // Search for documents that contain "zen" and ("motorcycle" or "archery")
   * miniSearch.search({
   *   combineWith: 'AND',
   *   queries: [
   *     'zen',
   *     {
   *       combineWith: 'OR',
   *       queries: ['motorcycle', 'archery']
   *     }
   *   ]
   * })
   *
   * // Search for documents that contain ("apple" or "pear") but not "juice" and
   * // not "tree"
   * miniSearch.search({
   *   combineWith: 'AND_NOT',
   *   queries: [
   *     {
   *       combineWith: 'OR',
   *       queries: ['apple', 'pear']
   *     },
   *     'juice',
   *     'tree'
   *   ]
   * })
   * ```
   *
   * Each node in the expression tree can be either a string, or an object that
   * supports all `SearchOptions` fields, plus a `queries` array field for
   * subqueries.
   *
   * Note that, while this can become complicated to do by hand for complex or
   * deeply nested queries, it provides a formalized expression tree API for
   * external libraries that implement a parser for custom query languages.
   *
   * @param query  Search query
   * @param options  Search options. Each option, if not given, defaults to the corresponding value of `searchOptions` given to the constructor, or to the library default.
   */
  search(query: Query, searchOptions: SearchOptions = {}): SearchResult[] {
    const combinedResults = this.executeQuery(query, searchOptions);

    const results = [];

    for (const [docId, { score, terms, match }] of combinedResults) {
      // Final score takes into account the number of matching QUERY terms.
      // The end user will only receive the MATCHED terms.
      const quality = terms.length;

      const result = {
        id: this._documentIds.get(docId),
        score: score * quality,
        terms: Object.keys(match),
        match,
      };

      Object.assign(result, this._storedFields.get(docId));
      if (searchOptions.filter == null || searchOptions.filter(result))
        results.push(result);
    }

    results.sort(byScore);

    return results;
  }

  /**
   * Provide suggestions for the given search query
   *
   * The result is a list of suggested modified search queries, derived from the
   * given search query, each with a relevance score, sorted by descending score.
   *
   * By default, it uses the same options used for search, except that by
   * default it performs prefix search on the last term of the query, and
   * combine terms with `'AND'` (requiring all query terms to match). Custom
   * options can be passed as a second argument. Defaults can be changed upon
   * calling the `MiniSearch` constructor, by passing a `autoSuggestOptions`
   * option.
   *
   * ### Basic usage:
   *
   * ```javascript
   * // Get suggestions for 'neuro':
   * miniSearch.autoSuggest('neuro')
   * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 0.46240 } ]
   * ```
   *
   * ### Multiple words:
   *
   * ```javascript
   * // Get suggestions for 'zen ar':
   * miniSearch.autoSuggest('zen ar')
   * // => [
   * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
   * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
   * // ]
   * ```
   *
   * ### Fuzzy suggestions:
   *
   * ```javascript
   * // Correct spelling mistakes using fuzzy search:
   * miniSearch.autoSuggest('neromancer', { fuzzy: 0.2 })
   * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 1.03998 } ]
   * ```
   *
   * ### Filtering:
   *
   * ```javascript
   * // Get suggestions for 'zen ar', but only within the 'fiction' category
   * // (assuming that 'category' is a stored field):
   * miniSearch.autoSuggest('zen ar', {
   *   filter: (result) => result.category === 'fiction'
   * })
   * // => [
   * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
   * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
   * // ]
   * ```
   *
   * @param queryString  Query string to be expanded into suggestions
   * @param options  Search options. The supported options and default values
   * are the same as for the `search` method, except that by default prefix
   * search is performed on the last term in the query, and terms are combined
   * with `'AND'`.
   * @return  A sorted array of suggestions sorted by relevance score.
   */
  autoSuggest(queryString: string, options: SearchOptions = {}): Suggestion[] {
    options = { ...this._options.autoSuggestOptions, ...options };

    const suggestions: Map<
      string,
      Omit<Suggestion, "suggestion"> & { count: number }
    > = new Map();

    for (const { score, terms } of this.search(queryString, options)) {
      const phrase = terms.join(" ");
      const suggestion = suggestions.get(phrase);

      if (suggestion != null) {
        suggestion.score += score;
        suggestion.count += 1;
      } else {
        suggestions.set(phrase, { score, terms, count: 1 });
      }
    }

    const results = [];

    for (const [suggestion, { score, terms, count }] of suggestions)
      results.push({ suggestion, terms, score: score / count });

    results.sort(byScore);

    return results;
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
   * Deserializes a JSON index (serialized with `JSON.stringify(miniSearch)`)
   * and instantiates a MiniSearch instance. It should be given the same options
   * originally used when serializing the index.
   *
   * ### Usage:
   *
   * ```javascript
   * // If the index was serialized with:
   * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * miniSearch.addAll(documents)
   *
   * const json = JSON.stringify(miniSearch)
   * // It can later be deserialized like this:
   * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
   * ```
   *
   * @param json  JSON-serialized index
   * @param options  configuration options, same as the constructor
   * @return An instance of MiniSearch deserialized from the given JSON.
   */
  static loadJSON<T = any>(json: string, options: Options<T>): MiniSearch<T> {
    if (options == null)
      throw new Error(
        "MiniSearch: loadJSON should be given the same options used when serializing the index"
      );

    return this.loadJS(JSON.parse(json), options);
  }

  /**
   * Returns the default value of an option. It will throw an error if no option
   * with the given name exists.
   *
   * @param optionName  Name of the option
   * @return The default value of the given option
   *
   * ### Usage:
   *
   * ```javascript
   * // Get default tokenizer
   * MiniSearch.getDefault('tokenize')
   *
   * // Get default term processor
   * MiniSearch.getDefault('processTerm')
   *
   * // Unknown options will throw an error
   * MiniSearch.getDefault('notExisting')
   * // => throws 'MiniSearch: unknown option "notExisting"'
   * ```
   */
  static getDefault(optionName: string): any {
    if (defaultOptions.hasOwnProperty(optionName))
      return getOwnProperty(defaultOptions, optionName);
    else throw new Error(`MiniSearch: unknown option "${optionName}"`);
  }

  /**
   * @ignore
   */
  static loadJS<T = any>(
    js: AsPlainObject,
    options: Options<T>
  ): MiniSearch<T> {
    const {
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
    } = js;

    if (serializationVersion !== 1 && serializationVersion !== 2)
      throw new Error(
        "MiniSearch: cannot deserialize an index created with an incompatible version"
      );

    const miniSearch = new MiniSearch(options);

    miniSearch._documentCount = documentCount;
    miniSearch._nextId = nextId;
    miniSearch._documentIds = objectToNumericMap(documentIds);
    miniSearch._idToShortId = new Map<any, number>();
    miniSearch._fieldIds = fieldIds;
    miniSearch._fieldLength = objectToNumericMap(fieldLength);
    miniSearch._avgFieldLength = averageFieldLength;
    miniSearch._storedFields = objectToNumericMap(storedFields);
    miniSearch._dirtCount = dirtCount || 0;
    miniSearch._index = new SearchableMap();

    for (const [shortId, id] of miniSearch._documentIds)
      miniSearch._idToShortId.set(id, shortId);

    for (const [term, data] of index) {
      const dataMap = new Map() as FieldTermData;

      for (const fieldId of Object.keys(data)) {
        let indexEntry = data[fieldId];

        // Version 1 used to nest the index entry inside a field called ds
        if (serializationVersion === 1)
          indexEntry = indexEntry.ds as unknown as SerializedIndexEntry;

        dataMap.set(
          parseInt(fieldId, 10),
          objectToNumericMap(indexEntry) as DocumentTermFreqs
        );
      }

      miniSearch._index.set(term, dataMap);
    }

    return miniSearch;
  }

  /**
   * @ignore
   */
  private executeQuery(
    query: Query,
    searchOptions: SearchOptions = {}
  ): RawResult {
    if (typeof query !== "string") {
      const options = { ...searchOptions, ...query, queries: undefined };
      const results = query.queries.map((subquery) =>
        this.executeQuery(subquery, options)
      );

      return this.combineResults(results, options.combineWith);
    }

    const {
      tokenize,
      processTerm,
      searchOptions: globalSearchOptions,
    } = this._options;
    const options = {
      tokenize,
      processTerm,
      ...globalSearchOptions,
      ...searchOptions,
    };
    const { tokenize: searchTokenize, processTerm: searchProcessTerm } =
      options;
    const terms = searchTokenize(query)
      .flatMap((term: string) => searchProcessTerm(term))
      .filter((term) => !!term) as string[];
    const queries: QuerySpec[] = terms.map(termToQuerySpec(options));
    const results = queries.map((query) =>
      this.executeQuerySpec(query, options)
    );

    return this.combineResults(results, options.combineWith);
  }

  /**
   * @ignore
   */
  private executeQuerySpec(
    query: QuerySpec,
    searchOptions: SearchOptions
  ): RawResult {
    const options: SearchOptionsWithDefaults = {
      ...this._options.searchOptions,
      ...searchOptions,
    };

    const boosts = (options.fields || this._options.fields).reduce(
      (boosts, field) => ({
        ...boosts,
        [field]: getOwnProperty(options.boost, field) || 1,
      }),
      {}
    );

    const { boostDocument, weights, maxFuzzy, bm25: bm25params } = options;

    const { fuzzy: fuzzyWeight, prefix: prefixWeight } = {
      ...defaultSearchOptions.weights,
      ...weights,
    };

    const data = this._index.get(query.term);
    const results = this.termResults(
      query.term,
      query.term,
      1,
      data,
      boosts,
      boostDocument,
      bm25params
    );

    let prefixMatches;
    let fuzzyMatches;

    if (query.prefix) prefixMatches = this._index.atPrefix(query.term);

    if (query.fuzzy) {
      const fuzzy = query.fuzzy === true ? 0.2 : query.fuzzy;
      const maxDistance =
        fuzzy < 1
          ? Math.min(maxFuzzy, Math.round(query.term.length * fuzzy))
          : fuzzy;

      if (maxDistance)
        fuzzyMatches = this._index.fuzzyGet(query.term, maxDistance);
    }

    if (prefixMatches)
      for (const [term, data] of prefixMatches) {
        const distance = term.length - query.term.length;

        if (!distance) continue;
        // Skip exact match.

        // Delete the term from fuzzy results (if present) if it is also a
        // prefix result. This entry will always be scored as a prefix result.
        fuzzyMatches?.delete(term);

        // Weight gradually approaches 0 as distance goes to infinity, with the
        // weight for the hypothetical distance 0 being equal to prefixWeight.
        // The rate of change is much lower than that of fuzzy matches to
        // account for the fact that prefix matches stay more relevant than
        // fuzzy matches for longer distances.
        const weight =
          (prefixWeight * term.length) / (term.length + 0.3 * distance);

        this.termResults(
          query.term,
          term,
          weight,
          data,
          boosts,
          boostDocument,
          bm25params,
          results
        );
      }

    if (fuzzyMatches)
      for (const term of fuzzyMatches.keys()) {
        const [data, distance] = fuzzyMatches.get(term)!;

        if (!distance) continue;
        // Skip exact match.

        // Weight gradually approaches 0 as distance goes to infinity, with the
        // weight for the hypothetical distance 0 being equal to fuzzyWeight.
        const weight = (fuzzyWeight * term.length) / (term.length + distance);

        this.termResults(
          query.term,
          term,
          weight,
          data,
          boosts,
          boostDocument,
          bm25params,
          results
        );
      }

    return results;
  }

  /**
   * @ignore
   */
  private combineResults(results: RawResult[], combineWith = OR): RawResult {
    if (results.length === 0) return new Map();

    const operator = combineWith.toLowerCase();

    return results.reduce(combinators[operator]) || new Map();
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
  private termResults(
    sourceTerm: string,
    derivedTerm: string,
    termWeight: number,
    fieldTermData: FieldTermData | undefined,
    fieldBoosts: { [field: string]: number },
    boostDocumentFn:
      | ((
          id: any,
          term: string,
          storedFields?: Record<string, unknown>
        ) => number)
      | undefined,
    bm25params: BM25Params,
    results: RawResult = new Map()
  ): RawResult {
    if (fieldTermData == null) return results;

    for (const field of Object.keys(fieldBoosts)) {
      const fieldBoost = fieldBoosts[field];
      const fieldId = this._fieldIds[field];

      const fieldTermFreqs = fieldTermData.get(fieldId);

      if (fieldTermFreqs == null) continue;

      let matchingFields = fieldTermFreqs.size;
      const avgFieldLength = this._avgFieldLength[fieldId];

      for (const docId of fieldTermFreqs.keys()) {
        if (!this._documentIds.has(docId)) {
          this.removeTerm(fieldId, docId, derivedTerm);
          matchingFields -= 1;
          continue;
        }

        const docBoost = boostDocumentFn
          ? boostDocumentFn(
              this._documentIds.get(docId),
              derivedTerm,
              this._storedFields.get(docId)
            )
          : 1;

        if (!docBoost) continue;

        const termFreq = fieldTermFreqs.get(docId)!;
        const fieldLength = this._fieldLength.get(docId)![fieldId];

        // NOTE: The total number of fields is set to the number of documents
        // `this._documentCount`. It could also make sense to use the number of
        // documents where the current field is non-blank as a normalization
        // factor. This will make a difference in scoring if the field is rarely
        // present. This is currently not supported, and may require further
        // analysis to see if it is a valid use case.
        const rawScore = calcBM25Score(
          termFreq,
          matchingFields,
          this._documentCount,
          fieldLength,
          avgFieldLength,
          bm25params
        );
        const weightedScore = termWeight * fieldBoost * docBoost * rawScore;

        const result = results.get(docId);

        if (result) {
          result.score += weightedScore;
          assignUniqueTerm(result.terms, sourceTerm);
          const match = getOwnProperty(result.match, derivedTerm);

          if (match) match.push(field);
          else result.match[derivedTerm] = [field];
        } else {
          results.set(docId, {
            score: weightedScore,
            terms: [sourceTerm],
            match: { [derivedTerm]: [field] },
          });
        }
      }
    }

    return results;
  }

  /**
   * @ignore
   */
  private addTerm(fieldId: number, documentId: number, term: string): void {
    const indexData = this._index.fetch(term, createMap);

    let fieldIndex = indexData.get(fieldId);

    if (fieldIndex == null) {
      fieldIndex = new Map();
      fieldIndex.set(documentId, 1);
      indexData.set(fieldId, fieldIndex);
    } else {
      const docs = fieldIndex.get(documentId);

      fieldIndex.set(documentId, (docs || 0) + 1);
    }
  }

  /**
   * @ignore
   */
  private removeTerm(fieldId: number, documentId: number, term: string): void {
    if (!this._index.has(term)) {
      this.warnDocumentChanged(documentId, fieldId, term);

      return;
    }

    const indexData = this._index.fetch(term, createMap);

    const fieldIndex = indexData.get(fieldId);

    if (fieldIndex == null || fieldIndex.get(documentId) == null)
      this.warnDocumentChanged(documentId, fieldId, term);
    else if (fieldIndex.get(documentId)! <= 1)
      if (fieldIndex.size <= 1) indexData.delete(fieldId);
      else fieldIndex.delete(documentId);
    else fieldIndex.set(documentId, fieldIndex.get(documentId)! - 1);

    if (this._index.get(term)!.size === 0) this._index.delete(term);
  }

  /**
   * @ignore
   */
  private warnDocumentChanged(
    shortDocumentId: number,
    fieldId: number,
    term: string
  ): void {
    for (const fieldName of Object.keys(this._fieldIds))
      if (this._fieldIds[fieldName] === fieldId) {
        this._options.logger(
          "warn",
          `MiniSearch: document with ID ${this._documentIds.get(
            shortDocumentId
          )} has changed before removal: term "${term}" was not present in field "${fieldName}". Removing a document after it has changed can corrupt the index!`,
          "version_conflict"
        );

        return;
      }
  }

  /**
   * @ignore
   */
  private addDocumentId(documentId: any): number {
    const shortDocumentId = this._nextId;

    this._idToShortId.set(documentId, shortDocumentId);
    this._documentIds.set(shortDocumentId, documentId);
    this._documentCount += 1;
    this._nextId += 1;

    return shortDocumentId;
  }

  /**
   * @ignore
   */
  private addFields(fields: string[]): void {
    for (let i = 0; i < fields.length; i++) this._fieldIds[fields[i]] = i;
  }

  /**
   * @ignore
   */
  private addFieldLength(
    documentId: number,
    fieldId: number,
    count: number,
    length: number
  ): void {
    let fieldLengths = this._fieldLength.get(documentId);

    if (fieldLengths == null)
      this._fieldLength.set(documentId, (fieldLengths = []));
    fieldLengths[fieldId] = length;

    const averageFieldLength = this._avgFieldLength[fieldId] || 0;
    const totalFieldLength = averageFieldLength * count + length;

    this._avgFieldLength[fieldId] = totalFieldLength / (count + 1);
  }

  /**
   * @ignore
   */
  private removeFieldLength(
    documentId: number,
    fieldId: number,
    count: number,
    length: number
  ): void {
    if (count === 1) {
      this._avgFieldLength[fieldId] = 0;

      return;
    }
    const totalFieldLength = this._avgFieldLength[fieldId] * count - length;

    this._avgFieldLength[fieldId] = totalFieldLength / (count - 1);
  }

  /**
   * @ignore
   */
  private saveStoredFields(documentId: number, doc: T): void {
    const { storeFields, extractField } = this._options;

    if (storeFields == null || storeFields.length === 0) return;

    let documentFields = this._storedFields.get(documentId);

    if (documentFields == null)
      this._storedFields.set(documentId, (documentFields = {}));

    for (const fieldName of storeFields) {
      const fieldValue = extractField(doc, fieldName);

      if (fieldValue !== undefined) documentFields[fieldName] = fieldValue;
    }
  }
}
