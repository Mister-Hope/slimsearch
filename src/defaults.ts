import { AND, OR, SPACE_OR_PUNCTUATION } from "./constant.js";
import type { BM25Params, LogLevel } from "./typings.js";
import { getOwnProperty } from "./utils.js";

export const defaultBM25params: BM25Params = { k: 1.2, b: 0.7, d: 0.5 };

export const defaultOptions = {
  idField: "id",
  extractField: (document: any, fieldName: string): unknown =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    document[fieldName],
  tokenize: (text: string): string[] => text.split(SPACE_OR_PUNCTUATION),
  processTerm: (term: string): string => term.toLowerCase(),
  fields: undefined,
  searchOptions: undefined,
  storeFields: [],
  logger: (level: LogLevel, message: string): void => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    console?.[level]?.(message);
  },
  autoVacuum: true,
} as const;

export const defaultSearchOptions = {
  combineWith: OR,
  prefix: false,
  fuzzy: false,
  maxFuzzy: 6,
  boost: {},
  weights: { fuzzy: 0.45, prefix: 0.375 },
  bm25: defaultBM25params,
} as const;

export const defaultAutoSuggestOptions = {
  combineWith: AND,
  prefix: (_term: string, index: number, terms: string[]): boolean =>
    index === terms.length - 1,
} as const;

export const defaultVacuumOptions = { batchSize: 1000, batchWait: 10 };
export const defaultVacuumConditions = { minDirtFactor: 0.1, minDirtCount: 20 };

export const defaultAutoVacuumOptions = {
  ...defaultVacuumOptions,
  ...defaultVacuumConditions,
};

/**
 * Returns the default value of an option. It will throw an error if no option
 * with the given name exists.
 *
 * ### Usage:
 *
 * ```js
 * // Get default tokenizer
 * getDefaultValue('tokenize')
 *
 * // Get default term processor
 * getDefaultValue('processTerm')
 *
 * // Unknown options will throw an error
 * getDefaultValue('notExisting')
 * // => throws 'SlimSearch: unknown option "notExisting"'
 * ```
 *
 * @typeParam ID  The id type of the documents being indexed.
 * @typeParam Document  The type of the documents being indexed.
 * @typeParam Index The type of the documents being indexed.
 *
 * @param optionName  Name of the option
 * @return The default value of the given option
 */
export const getDefaultValue = (optionName: string): unknown => {
  // eslint-disable-next-line no-prototype-builtins
  if (defaultOptions.hasOwnProperty(optionName))
    return getOwnProperty(defaultOptions, optionName);
  else throw new Error(`SlimSearch: unknown option "${optionName}"`);
};
