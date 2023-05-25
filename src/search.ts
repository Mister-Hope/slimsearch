import { type SearchIndex } from "./SearchIndex.js";
import { executeQuery } from "./results.js";
import {
  type Query,
  type SearchOptions,
  type SearchResult,
} from "./typings.js";
import { byScore } from "./utils.js";

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
 * search(index, 'zen art motorcycle')
 * // => [ { id: 2, score: 2.77258, match: { ... } }, { id: 4, score: 1.38629, match: { ... } } ]
 * ```
 *
 * ### Restrict search to specific fields:
 *
 * ```javascript
 * // Search only in the 'title' field
 * search(index, 'zen', { fields: ['title'] })
 * ```
 *
 * ### Field boosting:
 *
 * ```javascript
 * // Boost a field
 * search(index, 'zen', { boost: { title: 2 } })
 * ```
 *
 * ### Prefix search:
 *
 * ```javascript
 * // Search for "moto" with prefix search (it will match documents
 * // containing terms that start with "moto" or "neuro")
 * search(index, 'moto neuro', { prefix: true })
 * ```
 *
 * ### Fuzzy search:
 *
 * ```javascript
 * // Search for "ismael" with fuzzy search (it will match documents containing
 * // terms similar to "ismael", with a maximum edit distance of 0.2 term.length
 * // (rounded to nearest integer)
 * search(index, 'ismael', { fuzzy: 0.2 })
 * ```
 *
 * ### Combining strategies:
 *
 * ```javascript
 * // Mix of exact match, prefix search, and fuzzy search
 * search(index, 'ismael mob', {
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
 * search(index, 'ismael mob', {
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
 * search(index, 'motorcycle art', { combineWith: 'AND' })
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
 * search(index, 'motorcycle art', {
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
 * search(index, {
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
 * search(index, {
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
 * @param index Search Index
 * @param query  Search query
 * @param options  Search options. Each option, if not given, defaults to the corresponding value of `searchOptions` given to the constructor, or to the library default.
 */
export const search = <T>(
  index: SearchIndex<T>,
  query: Query,
  searchOptions: SearchOptions = {}
): SearchResult[] => {
  const combinedResults = executeQuery(index, query, searchOptions);

  const results = [];

  for (const [docId, { score, terms, match }] of combinedResults) {
    // Final score takes into account the number of matching QUERY terms.
    // The end user will only receive the MATCHED terms.
    const quality = terms.length;

    const result = {
      id: index._documentIds.get(docId),
      score: score * quality,
      terms: Object.keys(match),
      match,
    };

    Object.assign(result, index._storedFields.get(docId));
    if (searchOptions.filter == null || searchOptions.filter(result))
      results.push(result);
  }

  results.sort(byScore);

  return results;
};
