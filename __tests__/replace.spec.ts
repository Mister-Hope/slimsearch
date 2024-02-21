import { describe, expect, it } from "vitest";

import { addAll, createIndex, replace, search } from "../src/index.js";

describe("replace()", () => {
  type Document = { id: number; text: string };

  it("replaces an existing document with a new version", () => {
    const index = createIndex<number, Document>({ fields: ["text"] });
    const documents = [
      { id: 1, text: "Some quite interesting stuff" },
      { id: 2, text: "Some more interesting stuff" },
    ];

    addAll(index, documents);

    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([1, 2]);
    expect(search(index, "quite").map((doc) => doc.id)).toEqual([1]);
    expect(search(index, "even").map((doc) => doc.id)).toEqual([]);

    replace(index, { id: 1, text: "Some even more interesting stuff" });

    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([2, 1]);
    expect(search(index, "quite").map((doc) => doc.id)).toEqual([]);
    expect(search(index, "even").map((doc) => doc.id)).toEqual([1]);
  });

  it("raises error if a document with the given ID does not exist", () => {
    const index = createIndex<number, Document>({ fields: ["text"] });

    expect(() => {
      replace(index, { id: 1, text: "Some stuff" });
    }).toThrow(
      "SlimSearch: cannot discard document with ID 1: it is not in the index",
    );
  });
});
