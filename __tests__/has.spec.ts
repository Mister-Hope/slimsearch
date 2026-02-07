import { expect, it } from "vitest";

import { addAll, createIndex, discard, has, remove } from "../src/index.js";

it("returns true if a document with the given ID was added to the index, false otherwise", () => {
  interface Document {
    id: number;
    text: string;
    title: string;
  }
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
  const index = createIndex<number, Document>({ fields: ["title", "text"] });

  addAll(index, documents);

  expect(has(index, 1)).toBe(true);
  expect(has(index, 2)).toBe(true);
  expect(has(index, 3)).toBe(false);

  remove(index, {
    id: 1,
    title: "Divina Commedia",
    text: "Nel mezzo del cammin di nostra vita",
  });
  discard(index, 2);

  expect(has(index, 1)).toBe(false);
  expect(has(index, 2)).toBe(false);
});

it("works well with custom ID fields", () => {
  interface Document {
    uid: number;
    text: string;
    title: string;
  }
  const documents = [
    {
      uid: 1,
      title: "Divina Commedia",
      text: "Nel mezzo del cammin di nostra vita",
    },
    {
      uid: 2,
      title: "I Promessi Sposi",
      text: "Quel ramo del lago di Como",
    },
  ];
  const index = createIndex<number, Document>({
    fields: ["title", "text"],
    idField: "uid",
  });

  addAll(index, documents);

  expect(has(index, 1)).toBe(true);
  expect(has(index, 2)).toBe(true);
  expect(has(index, 3)).toBe(false);

  remove(index, {
    uid: 1,
    title: "Divina Commedia",
    text: "Nel mezzo del cammin di nostra vita",
  });
  discard(index, 2);

  expect(has(index, 1)).toBe(false);
  expect(has(index, 2)).toBe(false);
});
