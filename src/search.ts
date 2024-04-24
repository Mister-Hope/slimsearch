import type { SearchIndex } from "./SearchIndex.js";
import { executeQuery } from "./results.js";
import { WILDCARD } from "./symbols.js";
import type { Query, SearchOptions, SearchResult } from "./typings.js";
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
 * ```js
 * // Search for "zen art motorcycle" with default options: terms have to match
 * // exactly, and individual terms are joined with OR
 * search(searchIndex, 'zen art motorcycle')
 * // => [ { id: 2, score: 2.77258, match: { ... } }, { id: 4, score: 1.38629, match: { ... } } ]
 * ```
 *
 * ### Restrict search to specific fields:
 *
 * ```js
 * // Search only in the 'title' field
 * search(searchIndex, 'zen', { fields: ['title'] })
 * ```
 *
 * ### Field boosting:
 *
 * ```js
 * // Boost a field
 * search(searchIndex, 'zen', { boost: { title: 2 } })
 * ```
 *
 * ### Prefix search:
 *
 * ```js
 * // Search for "moto" with prefix search (it will match documents
 * // containing terms that start with "moto" or "neuro")
 * search(searchIndex, 'moto neuro', { prefix: true })
 * ```
 *
 * ### Fuzzy search:
 *
 * ```js
 * // Search for "ismael" with fuzzy search (it will match documents containing
 * // terms similar to "ismael", with a maximum edit distance of 0.2 term.length
 * // (rounded to nearest integer)
 * search(searchIndex, 'ismael', { fuzzy: 0.2 })
 * ```
 *
 * ### Combining strategies:
 *
 * ```js
 * // Mix of exact match, prefix search, and fuzzy search
 * search(searchIndex, 'ismael mob', {
 *  prefix: true,
 *  fuzzy: 0.2
 * })
 * ```
 *
 * ### Advanced prefix and fuzzy search:
 *
 * ```js
 * // Perform fuzzy and prefix search depending on the search term. Here
 * // performing prefix and fuzzy search only on terms longer than 3 characters
 * search(searchIndex, 'ismael mob', {
 *  prefix: term => term.length > 3
 *  fuzzy: term => term.length > 3 ? 0.2 : null
 * })
 * ```
 *
 * ### Combine with AND:
 *
 * ```js
 * // Combine search terms with AND (to match only documents that contain both
 * // "motorcycle" and "art")
 * search(searchIndex, 'motorcycle art', { combineWith: 'AND' })
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
 * ```js
 * // Filter only results in the 'fiction' category (assuming that 'category'
 * // is a stored field)
 * search(searchIndex, 'motorcycle art', {
 *   filter: (result) => result.category === 'fiction'
 * })
 * ```
 *
 * ### Wildcard query
 *
 * Searching for an empty string (assuming the default tokenizer) returns no
 * results. Sometimes though, one needs to match all documents, like in a
 * "wildcard" search. This is possible by passing the special value
 * `wildcard` as the query:
 *
 * ```javascript
 * // Return search results for all documents
 * search(index, WILDCARD)
 * ```
 *
 * Note that search options such as `filter` and `boostDocument` are still
 * applied, influencing which results are returned, and their order:
 *
 * ```javascript
 * // Return search results for all documents in the 'fiction' category
 * search(index, WILDCARD, {
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
 * ```js
 * // Search for documents that contain "zen" and ("motorcycle" or "archery")
 * search(searchIndex, {
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
 * search(searchIndex, {
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
 * @param searchIndex Search Index
 * @param query  Search query
 * @param options  Search options. Each option, if not given, defaults to the corresponding value of `searchOptions` given to the constructor, or to the library default.
 */
export const search = <
  ID,
  Document,
  Index extends Record<string, any> = Partial<Document>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  query: Query,
  searchOptions: SearchOptions<ID, Index> = {},
): SearchResult<ID, Index>[] => {
  const rawResults = executeQuery(searchIndex, query, searchOptions);

  const results: SearchResult<ID, Index>[] = [];

  for (const [docId, { score, terms, match }] of rawResults) {
    // terms are the matched query terms, which will be returned to the user
    // as queryTerms. The quality is calculated based on them, as opposed to
    // the matched terms in the document (which can be different due to
    // prefix and fuzzy match)
    const quality = terms.length || 1;

    const result = {
      id: searchIndex._documentIds.get(docId)!,
      score: score * quality,
      terms: Object.keys(match),
      queryTerms: terms,
      match,
    } as SearchResult<ID, Index>;

    Object.assign(result, searchIndex._storedFields.get(docId));
    if (searchOptions.filter == null || searchOptions.filter(result))
      results.push(result);
  }

  // If it's a wildcard query, and no document boost is applied, skip sorting
  // the results, as all results have the same score of 1
  if (
    query === WILDCARD &&
    searchOptions.boostDocument == null &&
    searchIndex._options.searchOptions.boostDocument == null
  )
    return results;

  results.sort(byScore);

  return results;
};
