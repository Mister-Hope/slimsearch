import { type SearchIndex } from "./SearchIndex.js";
import { search } from "./search.js";
import { type SearchOptions, type Suggestion } from "./typings.js";
import { byScore } from "./utils.js";

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
 * autoSuggest(index, 'neuro')
 * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 0.46240 } ]
 * ```
 *
 * ### Multiple words:
 *
 * ```javascript
 * // Get suggestions for 'zen ar':
 * autoSuggest(index, 'zen ar')
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
 * autoSuggest(index, 'neromancer', { fuzzy: 0.2 })
 * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 1.03998 } ]
 * ```
 *
 * ### Filtering:
 *
 * ```javascript
 * // Get suggestions for 'zen ar', but only within the 'fiction' category
 * // (assuming that 'category' is a stored field):
 * autoSuggest(index, 'zen ar', {
 *   filter: (result) => result.category === 'fiction'
 * })
 * // => [
 * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
 * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
 * // ]
 * ```
 *
 * @param index Search Index
 * @param queryString  Query string to be expanded into suggestions
 * @param options  Search options. The supported options and default values
 * are the same as for the `search` method, except that by default prefix
 * search is performed on the last term in the query, and terms are combined
 * with `'AND'`.
 * @return  A sorted array of suggestions sorted by relevance score.
 */
export const autoSuggest = <T>(
  index: SearchIndex<T>,
  queryString: string,
  options: SearchOptions = {}
): Suggestion[] => {
  options = { ...index._options.autoSuggestOptions, ...options };

  const suggestions: Map<
    string,
    Omit<Suggestion, "suggestion"> & { count: number }
  > = new Map();

  for (const { score, terms } of search(index, queryString, options)) {
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
};
