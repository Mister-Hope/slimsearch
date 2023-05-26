import { type SearchIndex } from "./SearchIndex.js";
import { OR } from "./constant.js";
import { defaultSearchOptions } from "./defaults.js";
import { removeTerm } from "./term.js";
import { type BM25Params, type Query, type SearchOptions } from "./typings.js";
import {
  type QuerySpec,
  type RawResult,
  assignUniqueTerm,
  calcBM25Score,
  combinators,
  getOwnProperty,
  termToQuerySpec,
} from "./utils.js";

export interface SearchOptionsWithDefaults<ID = any> extends SearchOptions<ID> {
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
}

export type DocumentTermFrequencies = Map<number, number>;

type FieldTermData = Map<number, DocumentTermFrequencies>;

const combineResults = (results: RawResult[], combineWith = OR): RawResult => {
  if (results.length === 0) return new Map();

  const operator = combineWith.toLowerCase();

  return results.reduce(combinators[operator]) || new Map();
};

const termResults = <Document, ID>(
  searchIndex: SearchIndex<Document, ID>,
  sourceTerm: string,
  derivedTerm: string,
  termWeight: number,
  fieldTermData: FieldTermData | undefined,
  fieldBoosts: { [field: string]: number },
  boostDocumentFn:
    | ((id: ID, term: string, storedFields?: Record<string, unknown>) => number)
    | undefined,
  bm25params: BM25Params,
  results: RawResult = new Map()
): RawResult => {
  if (fieldTermData == null) return results;

  for (const field of Object.keys(fieldBoosts)) {
    const fieldBoost = fieldBoosts[field];
    const fieldId = searchIndex._fieldIds[field];

    const fieldTermFrequencies = fieldTermData.get(fieldId);

    if (fieldTermFrequencies == null) continue;

    let matchingFields = fieldTermFrequencies.size;
    const avgFieldLength = searchIndex._avgFieldLength[fieldId];

    for (const docId of fieldTermFrequencies.keys()) {
      if (!searchIndex._documentIds.has(docId)) {
        removeTerm(searchIndex, fieldId, docId, derivedTerm);
        matchingFields -= 1;
        continue;
      }

      const docBoost = boostDocumentFn
        ? boostDocumentFn(
            searchIndex._documentIds.get(docId)!,
            derivedTerm,
            searchIndex._storedFields.get(docId)
          )
        : 1;

      if (!docBoost) continue;

      const termFreq = fieldTermFrequencies.get(docId)!;
      const fieldLength = searchIndex._fieldLength.get(docId)![fieldId];

      // NOTE: The total number of fields is set to the number of documents
      // `this._documentCount`. It could also make sense to use the number of
      // documents where the current field is non-blank as a normalization
      // factor. This will make a difference in scoring if the field is rarely
      // present. This is currently not supported, and may require further
      // analysis to see if it is a valid use case.
      const rawScore = calcBM25Score(
        termFreq,
        matchingFields,
        searchIndex._documentCount,
        fieldLength,
        avgFieldLength,
        bm25params
      );
      const weightedScore = termWeight * fieldBoost * docBoost * rawScore;

      const result = results.get(docId);

      if (result) {
        result.score += weightedScore;
        assignUniqueTerm(result.terms, sourceTerm);
        const match = <string[]>getOwnProperty(result.match, derivedTerm);

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
};

const executeQuerySpec = <Document, ID>(
  searchIndex: SearchIndex<Document, ID>,
  query: QuerySpec,
  searchOptions: SearchOptions
): RawResult => {
  const options: SearchOptionsWithDefaults = {
    ...searchIndex._options.searchOptions,
    ...searchOptions,
  };

  const boosts = (options.fields || searchIndex._options.fields).reduce(
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

  const data = searchIndex._index.get(query.term);
  const results = termResults(
    searchIndex,
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

  if (query.prefix) prefixMatches = searchIndex._index.atPrefix(query.term);

  if (query.fuzzy) {
    const fuzzy = query.fuzzy === true ? 0.2 : query.fuzzy;
    const maxDistance =
      fuzzy < 1
        ? Math.min(maxFuzzy, Math.round(query.term.length * fuzzy))
        : fuzzy;

    if (maxDistance)
      fuzzyMatches = searchIndex._index.fuzzyGet(query.term, maxDistance);
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

      termResults(
        searchIndex,
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

      termResults(
        searchIndex,
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
};

export const executeQuery = <Document, ID>(
  searchIndex: SearchIndex<Document, ID>,
  query: Query,
  searchOptions: SearchOptions<ID> = {}
): RawResult => {
  if (typeof query !== "string") {
    const options = { ...searchOptions, ...query, queries: undefined };
    const results = query.queries.map((subQuery) =>
      executeQuery(searchIndex, subQuery, options)
    );

    return combineResults(results, options.combineWith);
  }

  const {
    tokenize,
    processTerm,
    searchOptions: globalSearchOptions,
  } = searchIndex._options;
  const options = {
    tokenize,
    processTerm,
    ...globalSearchOptions,
    ...searchOptions,
  };
  const { tokenize: searchTokenize, processTerm: searchProcessTerm } = options;
  // @ts-ignore
  const terms = searchTokenize(query)
    // @ts-ignore
    .flatMap((term: string) => searchProcessTerm(term))
    .filter((term) => !!term) as string[];
  // @ts-ignore
  const queries: QuerySpec[] = terms.map(termToQuerySpec(options));
  const results = queries.map((query) =>
    // @ts-ignore
    executeQuerySpec(searchIndex, query, options)
  );

  return combineResults(results, options.combineWith);
};
