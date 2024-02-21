import { type SearchIndex } from "./SearchIndex.js";
import {
  defaultAutoVacuumOptions,
  defaultVacuumConditions,
  defaultVacuumOptions,
} from "./defaults.js";
import { type VacuumConditions, type VacuumOptions } from "./typings.js";

const shouldVacuum = <Document, ID>(
  searchIndex: SearchIndex<Document, ID>,
  conditions?: VacuumConditions
): boolean => {
  if (conditions == null) return true;

  const {
    minDirtCount = defaultAutoVacuumOptions.minDirtCount,
    minDirtFactor = defaultAutoVacuumOptions.minDirtFactor,
  } = conditions;

  return (
    searchIndex.dirtCount >= minDirtCount &&
    searchIndex.dirtFactor >= minDirtFactor
  );
};

const doVacuum = async <Document, ID>(
  searchIndex: SearchIndex<Document, ID>,
  options: VacuumOptions,
  conditions?: VacuumConditions
): Promise<void> => {
  const initialDirtCount = searchIndex._dirtCount;

  if (shouldVacuum(searchIndex, conditions)) {
    const batchSize = options.batchSize || defaultVacuumOptions.batchSize;
    const batchWait = options.batchWait || defaultVacuumOptions.batchWait;
    let i = 1;

    for (const [term, fieldsData] of searchIndex._index) {
      for (const [fieldId, fieldIndex] of fieldsData)
        for (const [shortId] of fieldIndex) {
          if (searchIndex._documentIds.has(shortId)) continue;

          if (fieldIndex.size <= 1) fieldsData.delete(fieldId);
          else fieldIndex.delete(shortId);
        }

      if (searchIndex._index.get(term)!.size === 0)
        searchIndex._index.delete(term);

      if (i % batchSize === 0)
        await new Promise((resolve) => setTimeout(resolve, batchWait));

      i += 1;
    }

    searchIndex._dirtCount -= initialDirtCount;
  }

  // Make the next lines always async, so they execute after this function returns
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await null;

  searchIndex._currentVacuum = searchIndex._enqueuedVacuum;
  searchIndex._enqueuedVacuum = null;
};

const conditionalVacuum = <Document, ID>(
  searchIndex: SearchIndex<Document, ID>,
  options: VacuumOptions,
  conditions?: VacuumConditions
): Promise<void> => {
  // If a vacuum is already ongoing, schedule another as soon as it finishes,
  // unless there's already one enqueued. If one was already enqueued, do not
  // enqueue another on top, but make sure that the conditions are the
  // broadest.
  if (searchIndex._currentVacuum) {
    searchIndex._enqueuedVacuumConditions =
      searchIndex._enqueuedVacuumConditions && conditions;
    if (searchIndex._enqueuedVacuum != null) return searchIndex._enqueuedVacuum;

    searchIndex._enqueuedVacuum = searchIndex._currentVacuum.then(() => {
      const conditions = searchIndex._enqueuedVacuumConditions;

      searchIndex._enqueuedVacuumConditions = defaultVacuumConditions;

      return doVacuum(searchIndex, options, conditions);
    });

    return searchIndex._enqueuedVacuum;
  }

  if (shouldVacuum(searchIndex, conditions) === false) return Promise.resolve();

  searchIndex._currentVacuum = doVacuum(searchIndex, options);

  return searchIndex._currentVacuum;
};

export const maybeAutoVacuum = <Document, ID>(
  searchIndex: SearchIndex<Document, ID>
): void => {
  if (searchIndex._options.autoVacuum === false) return;

  const { minDirtFactor, minDirtCount, batchSize, batchWait } =
    searchIndex._options.autoVacuum;

  void conditionalVacuum(
    searchIndex,
    { batchSize, batchWait },
    { minDirtCount, minDirtFactor }
  );
};

/**
 * Triggers a manual vacuuming, cleaning up references to discarded documents
 * from the inverted index
 *
 * Vacuuming is only useful for applications that use the
 * {@link discard} or {@link replace} methods.
 *
 * By default, vacuuming is performed automatically when needed (controlled by
 * the `autoVacuum` field in {@link SearchOptions}), so there is usually no need to call
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
 * @param searchIndex Search Index
 * @param options  Configuration options for the batch size and delay. See
 * {@link VacuumOptions}.
 */
export const vacuum = <Document, ID>(
  searchIndex: SearchIndex<Document, ID>,
  options: VacuumOptions = {}
): Promise<void> => conditionalVacuum(searchIndex, options);
