import { type SearchIndex } from "./SearchIndex.js";

export const warnDocumentChanged = (
  index: SearchIndex,
  shortDocumentId: number,
  fieldId: number,
  term: string
): void => {
  for (const fieldName of Object.keys(index._fieldIds))
    if (index._fieldIds[fieldName] === fieldId) {
      index._options.logger(
        "warn",
        `MiniSearch: document with ID ${index._documentIds.get(
          shortDocumentId
        )} has changed before removal: term "${term}" was not present in field "${fieldName}". Removing a document after it has changed can corrupt the index!`,
        "version_conflict"
      );

      return;
    }
};
