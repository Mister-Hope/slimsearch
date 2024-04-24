import type { SearchIndex } from "./SearchIndex.js";

export const warnDocumentChanged = <
  ID,
  Document,
  Index extends Record<string, any> = Record<never, never>,
>(
  searchIndex: SearchIndex<ID, Document, Index>,
  shortDocumentId: number,
  fieldId: number,
  term: string,
): void => {
  for (const fieldName of Object.keys(searchIndex._fieldIds))
    if (searchIndex._fieldIds[fieldName] === fieldId) {
      searchIndex._options.logger(
        "warn",
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `SlimSearch: document with ID ${searchIndex._documentIds.get(
          shortDocumentId,
        )} has changed before removal: term "${term}" was not present in field "${fieldName}". Removing a document after it has changed can corrupt the index!`,
        "version_conflict",
      );

      return;
    }
};
