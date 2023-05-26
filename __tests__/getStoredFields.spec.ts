import { describe, expect, it } from "vitest";

import { addAll, createIndex, discard, getStoredFields } from "../src/index.js";

describe("getStoredFields()", () => {
  it("returns the stored fields for the given document ID, or undefined if the document is not in the index", () => {
    type Document = { id: number; text: string; title: string };
    const documents = [
      {
        id: 1,
        title: "Divina Commedia",
        text: "Nel mezzo del cammin di nostra vita",
      },
      {
        id: 2,
        title: "I Promessi Sposi",
        text: "Quel ramo del lago di Como",
      },
    ];
    const index = createIndex<Document, number>({
      fields: ["title", "text"],
      storeFields: ["title", "text"],
    });

    addAll(index, documents);

    expect(getStoredFields(index, 1)).toEqual({
      title: "Divina Commedia",
      text: "Nel mezzo del cammin di nostra vita",
    });
    expect(getStoredFields(index, 2)).toEqual({
      title: "I Promessi Sposi",
      text: "Quel ramo del lago di Como",
    });
    expect(getStoredFields(index, 3)).toBe(undefined);

    discard(index, 1);
    expect(getStoredFields(index, 1)).toBe(undefined);
  });
});
