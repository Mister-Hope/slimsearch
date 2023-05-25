import { type SearchIndex } from "./SearchIndex.js";
import { add } from "./add.js";
import { discard } from "./remove.js";

/**
 * It replaces an existing document with the given updated version
 *
 * It works by discarding the current version and adding the updated one, so
 * it is functionally equivalent to calling [[discard]] followed by
 * [[add]]. The ID of the updated document should be the same as
 * the original one.
 *
 * Since it uses [[discard]] internally, this method relies on
 * vacuuming to clean up obsolete document references from the index, allowing
 * memory to be released (see [[discard]]).
 *
 * @param index The search Index
 * @param updatedDocument  The updated document to replace the old version
 * with
 */
export const replace = <T>(index: SearchIndex<T>, updatedDocument: T): void => {
  const { idField, extractField } = index._options;
  const id = extractField(updatedDocument, idField);

  discard(index, id);
  add(index, updatedDocument);
};
