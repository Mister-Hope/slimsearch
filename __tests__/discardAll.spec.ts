import { describe, expect, it } from "vitest";

import {
  add,
  addAll,
  createIndex,
  discardAll,
  has,
  search,
} from "../src/index.js";

describe("discardAll()", () => {
  it("prevents the documents from appearing in search results", () => {
    interface Document {
      id: number;
      text: string;
    }
    const index = createIndex<number, Document>({ fields: ["text"] });
    const documents = [
      { id: 1, text: "Some interesting stuff" },
      { id: 2, text: "Some more interesting stuff" },
      { id: 3, text: "Some even more interesting stuff" },
    ];

    addAll(index, documents);

    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((id) => has(index, id))).toEqual([true, true, true]);

    discardAll(index, [1, 3]);

    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([2]);
    expect([1, 2, 3].map((id) => has(index, id))).toEqual([false, true, false]);
  });

  it("only triggers at most a single auto vacuum at the end", () => {
    interface Document {
      id: number;
      text: string;
    }
    const index = createIndex<number, Document>({
      fields: ["text"],
      autoVacuum: {
        minDirtCount: 3,
        minDirtFactor: 0,
        batchSize: 1,
        batchWait: 10,
      },
    });
    const documents: Document[] = [];

    for (let i = 1; i <= 10; i++)
      documents.push({ id: i, text: `Document ${i}` });

    addAll(index, documents);
    discardAll(index, [1, 2]);
    expect(index.isVacuuming).toEqual(false);

    discardAll(index, [3, 4, 5, 6, 7, 8, 9, 10]);
    expect(index.isVacuuming).toEqual(true);
    expect(index._enqueuedVacuum).toEqual(null);
  });

  it("does not change auto vacuum settings in case of errors", () => {
    interface Document {
      id: number;
      text: string;
    }
    const index = createIndex<number, Document>({
      fields: ["text"],
      autoVacuum: {
        minDirtCount: 1,
        minDirtFactor: 0,
        batchSize: 1,
        batchWait: 10,
      },
    });

    add(index, { id: 1, text: "Some stuff" });

    expect(() => {
      discardAll(index, [3]);
    }).toThrow();
    expect(index.isVacuuming).toEqual(false);

    discardAll(index, [1]);
    expect(index.isVacuuming).toEqual(true);
  });
});
