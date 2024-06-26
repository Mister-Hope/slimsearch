import { expect, it } from "vitest";

import { addAll, createIndex } from "../src/index.js";

it("adds all the documents to the index", () => {
  interface Document {
    id: number;
    text: string;
  }
  const index = createIndex<number, Document>({ fields: ["text"] });
  const documents = [
    { id: 1, text: "Nel mezzo del cammin di nostra vita" },
    { id: 2, text: "Mi ritrovai per una selva oscura" },
  ];

  addAll(index, documents);
  expect(index.documentCount).toEqual(documents.length);
});
