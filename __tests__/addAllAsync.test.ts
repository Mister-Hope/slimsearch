import { expect, it } from "vitest";

import { addAllAsync, createIndex } from "../src/index.js";

it("adds all the documents to the index", () => {
  interface Document {
    id: number;
    text: string;
  }
  const index = createIndex<number, Document>({ fields: ["text"] });
  const documents = [
    { id: 1, text: "Nel mezzo" },
    { id: 2, text: "del cammin" },
    { id: 3, text: "di nostra vita" },
    { id: 4, text: "Mi ritrovai" },
    { id: 5, text: "per una" },
    { id: 6, text: "selva oscura" },
    { id: 7, text: "ché la" },
    { id: 8, text: "diritta via" },
    { id: 9, text: "era smarrita" },
    { id: 10, text: "ahi quanto" },
    { id: 11, text: "a dir" },
    { id: 12, text: "qual era" },
    { id: 13, text: "è cosa dura" },
  ];

  return addAllAsync(index, documents).then(() => {
    expect(index.documentCount).toEqual(documents.length);
  });
});

it("accepts a chunkSize option", () => {
  interface Document {
    id: number;
    text: string;
  }
  const index = createIndex<number, Document>({ fields: ["text"] });
  const documents = [
    { id: 1, text: "Nel mezzo" },
    { id: 2, text: "del cammin" },
    { id: 3, text: "di nostra vita" },
    { id: 4, text: "Mi ritrovai" },
    { id: 5, text: "per una" },
    { id: 6, text: "selva oscura" },
    { id: 7, text: "ché la" },
    { id: 8, text: "diritta via" },
    { id: 9, text: "era smarrita" },
    { id: 10, text: "ahi quanto" },
    { id: 11, text: "a dir" },
    { id: 12, text: "qual era" },
    { id: 13, text: "è cosa dura" },
  ];

  return addAllAsync(index, documents, { chunkSize: 3 }).then(() => {
    expect(index.documentCount).toEqual(documents.length);
  });
});
