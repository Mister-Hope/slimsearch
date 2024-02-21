import { type SearchIndex } from "./SearchIndex.js";
import { add } from "./add.js";
import { discard } from "./remove.js";

/**
 * It replaces an existing document with the given updated version
 *
 * It works by discarding the current version and adding the updated one, so
 * it is functionally equivalent to calling {@link discard} followed by
 * {@link add}. The ID of the updated document should be the same as
 * the original one.
 *
 * Since it uses {@link discard} internally, this method relies on
 * vacuuming to clean up obsolete document references from the index, allowing
 * memory to be released (see {@link discard}).
 *
 * @param searchIndex The search Index
 * @param updatedDocument  The updated document to replace the old version
 * with
 */
export const replace = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  updatedDocument: Document,
): void => {
  const { idField, extractField } = searchIndex._options;
  const id = <ID>extractField(updatedDocument, idField);

  discard(searchIndex, id);
  add(searchIndex, updatedDocument);
};
