import { AND, AND_NOT, OR } from "./constant.js";
import {
  type BM25Params,
  type MatchInfo,
  type SearchOptions,
} from "./typings.js";

export const assignUniqueTerm = (target: string[], term: string): void => {
  // Avoid adding duplicate terms.
  if (!target.includes(term)) target.push(term);
};

export const assignUniqueTerms = (
  target: string[],
  source: readonly string[]
): void => {
  // Avoid adding duplicate terms.
  for (const term of source) if (!target.includes(term)) target.push(term);
};

interface Scored {
  score: number;
}

export const byScore = ({ score: a }: Scored, { score: b }: Scored): number =>
  b - a;

export const createMap = <K, V>(): Map<K, V> => new Map<K, V>();

export const objectToNumericMap = <Value>(object: {
  [key: string]: Value;
}): Map<number, Value> => {
  const map = new Map<number, Value>();

  for (const key of Object.keys(object))
    map.set(parseInt(key, 10), object[key]);

  return map;
};

export const getOwnProperty = (object: any, property: string): unknown =>
  Object.prototype.hasOwnProperty.call(object, property)
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      object[property]
    : undefined;

interface RawResultValue {
  // Intermediate score, before applying the final score based on number of
  // matched terms.
  score: number;

  // Set of all query terms that were matched. They may not be present in the
  // text exactly in the case of prefix/fuzzy matches. We must check for
  // uniqueness before adding a new term. This is much faster than using a set,
  // because the number of elements is relatively small.
  terms: string[];

  // All terms that were found in the content, including the fields in which
  // they were present. This object will be provided as part of the final search
  // results.
  match: MatchInfo;
}

export type RawResult = Map<number, RawResultValue>;

export type CombinatorFunction = (a: RawResult, b: RawResult) => RawResult;

export const combinators: { [kind: string]: CombinatorFunction } = {
  [OR]: (a: RawResult, b: RawResult) => {
    for (const docId of b.keys()) {
      const existing = a.get(docId);

      if (existing == null) {
        a.set(docId, b.get(docId)!);
      } else {
        const { score, terms, match } = b.get(docId)!;

        existing.score = existing.score + score;
        existing.match = Object.assign(existing.match, match);
        assignUniqueTerms(existing.terms, terms);
      }
    }

    return a;
  },
  [AND]: (a: RawResult, b: RawResult) => {
    const combined = new Map();

    for (const docId of b.keys()) {
      const existing = a.get(docId);

      if (existing == null) continue;

      const { score, terms, match } = b.get(docId)!;

      assignUniqueTerms(existing.terms, terms);
      combined.set(docId, {
        score: existing.score + score,
        terms: existing.terms,
        match: Object.assign(existing.match, match),
      });
    }

    return combined;
  },
  [AND_NOT]: (a: RawResult, b: RawResult) => {
    for (const docId of b.keys()) a.delete(docId);

    return a;
  },
};

export const calcBM25Score = (
  termFreq: number,
  matchingCount: number,
  totalCount: number,
  fieldLength: number,
  avgFieldLength: number,
  bm25params: BM25Params
): number => {
  const { k, b, d } = bm25params;
  const invDocFreq = Math.log(
    1 + (totalCount - matchingCount + 0.5) / (matchingCount + 0.5)
  );

  return (
    invDocFreq *
    (d +
      (termFreq * (k + 1)) /
        (termFreq + k * (1 - b + (b * fieldLength) / avgFieldLength)))
  );
};

export type QuerySpec = {
  prefix: boolean;
  fuzzy: number | boolean;
  term: string;
};

export const termToQuerySpec =
  (options: SearchOptions) =>
  (term: string, i: number, terms: string[]): QuerySpec => {
    const fuzzy =
      typeof options.fuzzy === "function"
        ? options.fuzzy(term, i, terms)
        : options.fuzzy || false;
    const prefix =
      typeof options.prefix === "function"
        ? options.prefix(term, i, terms)
        : options.prefix === true;

    return { term, fuzzy, prefix };
  };
