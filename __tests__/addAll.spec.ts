import { describe, expect, it } from "vitest";

import { addAll, createIndex } from "../src/index.js";

describe("addAll()", () => {
  it("adds all the documents to the index", () => {
    type Document = { id: number; text: string };
    const index = createIndex<Document, number>({ fields: ["text"] });
    const documents = [
      { id: 1, text: "Nel mezzo del cammin di nostra vita" },
      { id: 2, text: "Mi ritrovai per una selva oscura" },
    ];

    addAll(index, documents);
    expect(index.documentCount).toEqual(documents.length);
  });
});