import { type SearchIndex } from "./SearchIndex.js";
import {
  defaultAutoVacuumOptions,
  defaultVacuumConditions,
  defaultVacuumOptions,
} from "./defaults.js";
import { type VacuumConditions, type VacuumOptions } from "./typings.js";

const shouldVacuum = <T>(
  index: SearchIndex<T>,
  conditions?: VacuumConditions
) => {
  if (conditions == null) return true;

  const {
    minDirtCount = defaultAutoVacuumOptions.minDirtCount,
    minDirtFactor = defaultAutoVacuumOptions.minDirtFactor,
  } = conditions;

  return index.dirtCount >= minDirtCount && index.dirtFactor >= minDirtFactor;
};

const doVacuum = async <T>(
  index: SearchIndex<T>,
  options: VacuumOptions,
  conditions?: VacuumConditions
): Promise<void> => {
  const initialDirtCount = index._dirtCount;

  if (shouldVacuum(index, conditions)) {
    const batchSize = options.batchSize || defaultVacuumOptions.batchSize;
    const batchWait = options.batchWait || defaultVacuumOptions.batchWait;
    let i = 1;

    for (const [term, fieldsData] of index._index) {
      for (const [fieldId, fieldIndex] of fieldsData)
        for (const [shortId] of fieldIndex) {
          if (index._documentIds.has(shortId)) continue;

          if (fieldIndex.size <= 1) fieldsData.delete(fieldId);
          else fieldIndex.delete(shortId);
        }

      if (index._index.get(term)!.size === 0) index._index.delete(term);

      if (i % batchSize === 0)
        await new Promise((resolve) => setTimeout(resolve, batchWait));

      i += 1;
    }

    index._dirtCount -= initialDirtCount;
  }

  // Make the next lines always async, so they execute after this function returns
  await null;

  index._currentVacuum = index._enqueuedVacuum;
  index._enqueuedVacuum = null;
};

const conditionalVacuum = <T>(
  index: SearchIndex<T>,
  options: VacuumOptions,
  conditions?: VacuumConditions
): Promise<void> => {
  // If a vacuum is already ongoing, schedule another as soon as it finishes,
  // unless there's already one enqueued. If one was already enqueued, do not
  // enqueue another on top, but make sure that the conditions are the
  // broadest.
  if (index._currentVacuum) {
    index._enqueuedVacuumConditions =
      index._enqueuedVacuumConditions && conditions;
    if (index._enqueuedVacuum != null) return index._enqueuedVacuum;

    index._enqueuedVacuum = index._currentVacuum.then(() => {
      const conditions = index._enqueuedVacuumConditions;

      index._enqueuedVacuumConditions = defaultVacuumConditions;

      return doVacuum(index, options, conditions);
    });

    return index._enqueuedVacuum;
  }

  if (shouldVacuum(index, conditions) === false) return Promise.resolve();

  index._currentVacuum = doVacuum(index, options);

  return index._currentVacuum;
};

export const maybeAutoVacuum = <T>(index: SearchIndex<T>): void => {
  if (index._options.autoVacuum === false) return;

  const { minDirtFactor, minDirtCount, batchSize, batchWait } =
    index._options.autoVacuum;

  conditionalVacuum(
    index,
    { batchSize, batchWait },
    { minDirtCount, minDirtFactor }
  );
};

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
 * @param index Search Index
 * @param options  Configuration options for the batch size and delay. See
 * [[VacuumOptions]].
 */
export const vacuum = <T>(
  index: SearchIndex<T>,
  options: VacuumOptions = {}
): Promise<void> => conditionalVacuum(index, options);
