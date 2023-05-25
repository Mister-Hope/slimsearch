import { AND, OR, SPACE_OR_PUNCTUATION } from "./constant.js";
import { type BM25Params, type LogLevel } from "./typings.js";

export const defaultBM25params: BM25Params = { k: 1.2, b: 0.7, d: 0.5 };

export const defaultOptions = {
  idField: "id",
  extractField: (document: any, fieldName: string) => document[fieldName],
  tokenize: (text: string, _fieldName?: string) =>
    text.split(SPACE_OR_PUNCTUATION),
  processTerm: (term: string, _fieldName?: string) => term.toLowerCase(),
  fields: undefined,
  searchOptions: undefined,
  storeFields: [],
  logger: (level: LogLevel, message: string, _code?: string) =>
    console != null && console.warn != null && console[level](message),
  autoVacuum: true,
};

export const defaultSearchOptions = {
  combineWith: OR,
  prefix: false,
  fuzzy: false,
  maxFuzzy: 6,
  boost: {},
  weights: { fuzzy: 0.45, prefix: 0.375 },
  bm25: defaultBM25params,
};

export const defaultAutoSuggestOptions = {
  combineWith: AND,
  prefix: (term: string, i: number, terms: string[]): boolean =>
    i === terms.length - 1,
};

export const defaultVacuumOptions = { batchSize: 1000, batchWait: 10 };
export const defaultVacuumConditions = { minDirtFactor: 0.1, minDirtCount: 20 };

export const defaultAutoVacuumOptions = {
  ...defaultVacuumOptions,
  ...defaultVacuumConditions,
};
