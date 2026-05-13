import { beforeEach, describe, expect, it } from "vitest";

import type { SearchIndex } from "../src/index.js";
import { addAll, createIndex, loadJSONIndex, removeAll, search } from "../src/index.js";

interface Document {
  id: number;
  text: string;
  title: string;
}

const documents = [
  {
    id: 1,
    title: "Divina Commedia",
    text: "Nel mezzo del cammin di nostra vita ... cammin",
  },
  { id: 2, title: "I Promessi Sposi", text: "Quel ramo del lago di Como" },
  {
    id: 3,
    title: "Vita Nova",
    text: "In quella parte del libro della mia memoria ... cammin",
  },
];

describe(removeAll, () => {
  let index: SearchIndex<number, Document>;

  // oxlint-disable-next-line vitest/no-hooks
  beforeEach(() => {
    index = createIndex({ fields: ["title", "text"] });
  });

  it("removes all documents from the index if called with no argument", () => {
    const empty = loadJSONIndex(JSON.stringify(index), {
      fields: ["title", "text"],
    });

    addAll(index, documents);
    expect(index.documentCount).toBe(3);

    removeAll(index);

    expect(index).toStrictEqual(empty);
  });

  it("removes the given documents from the index", () => {
    addAll(index, documents);
    expect(index.documentCount).toBe(3);

    removeAll(index, [documents[0], documents[2]]);

    expect(index.documentCount).toBe(1);
    expect(search(index, "commedia")).toHaveLength(0);
    expect(search(index, "vita")).toHaveLength(0);
    expect(search(index, "lago")).toHaveLength(1);
  });

  it("raises an error if called with a falsey argument", () => {
    addAll(index, documents);

    expect(() => {
      // @ts-expect-error: Wrong param
      removeAll(index, null);
    }).toThrow("Expected documents to be present. Omit the argument to remove all documents.");
    expect(() => {
      removeAll(index, undefined);
    }).toThrow("Expected documents to be present. Omit the argument to remove all documents.");
    expect(() => {
      // @ts-expect-error: Wrong param
      removeAll(index, false);
    }).toThrow("Expected documents to be present. Omit the argument to remove all documents.");
    expect(() => {
      // @ts-expect-error: Wrong param
      removeAll(index, "");
    }).toThrow("Expected documents to be present. Omit the argument to remove all documents.");
    expect(() => {
      removeAll(index, []);
    }).not.toThrow();

    expect(index.documentCount).toStrictEqual(documents.length);
  });
});
