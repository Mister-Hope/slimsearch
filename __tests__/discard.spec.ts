import { describe, expect, it } from "vitest";

import {
  add,
  addAll,
  createIndex,
  discard,
  has,
  loadJSONIndex,
  remove,
  search,
  vacuum,
} from "../src/index.js";

describe("discard()", () => {
  it("prevents a document from appearing in search results", () => {
    const index = createIndex({ fields: ["text"] });
    const documents = [
      { id: 1, text: "Some interesting stuff" },
      { id: 2, text: "Some more interesting stuff" },
    ];

    addAll(index, documents);

    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([1, 2]);
    expect([1, 2].map((id) => has(index, id))).toEqual([true, true]);

    discard(index, 1);

    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([2]);
    expect([1, 2].map((id) => has(index, id))).toEqual([false, true]);
  });

  it("raises error if a document with the given ID does not exist", () => {
    const index = createIndex({ fields: ["text"] });

    expect(() => {
      discard(index, 99);
    }).toThrow(
      "MiniSearch: cannot discard document with ID 99: it is not in the index"
    );
  });

  it("adjusts internal data to account for the document being discarded", () => {
    const index = createIndex({ fields: ["text"] });
    const documents = [
      { id: 1, text: "Some interesting stuff" },
      { id: 2, text: "Some more interesting stuff" },
    ];

    addAll(index, documents);
    const clone = loadJSONIndex(JSON.stringify(index), {
      fields: ["text"],
    });

    discard(index, 1);
    remove(clone, { id: 1, text: "Some interesting stuff" });

    expect(index._idToShortId).toEqual(clone._idToShortId);
    expect(index._documentIds).toEqual(clone._documentIds);
    expect(index._fieldLength).toEqual(clone._fieldLength);
    expect(index._storedFields).toEqual(clone._storedFields);
    expect(index._avgFieldLength).toEqual(clone._avgFieldLength);
    expect(index._documentCount).toEqual(clone._documentCount);
    expect(index._dirtCount).toEqual(1);
  });

  it("allows adding a new version of the document afterwards", () => {
    const index = createIndex({ fields: ["text"], storeFields: ["text"] });
    const documents = [
      { id: 1, text: "Some interesting stuff" },
      { id: 2, text: "Some more interesting stuff" },
    ];

    addAll(index, documents);

    discard(index, 1);
    add(index, { id: 1, text: "Some new stuff" });

    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([1, 2]);
    expect(search(index, "new").map((doc) => doc.id)).toEqual([1]);

    discard(index, 1);
    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([2]);

    add(index, { id: 1, text: "Some newer stuff" });
    expect(search(index, "stuff").map((doc) => doc.id)).toEqual([1, 2]);
    expect(search(index, "new").map((doc) => doc.id)).toEqual([]);
    expect(search(index, "newer").map((doc) => doc.id)).toEqual([1]);
  });

  it("leaves the index in the same state as removal when all terms are searched at least once", () => {
    const index = createIndex({ fields: ["text"], storeFields: ["text"] });
    const document = { id: 1, text: "Some stuff" };

    add(index, document);
    const clone = loadJSONIndex(JSON.stringify(index), {
      fields: ["text"],
      storeFields: ["text"],
    });

    discard(index, 1);
    remove(clone, { id: 1, text: "Some stuff" });

    expect(index).not.toEqual(clone);

    const results = search(index, "some stuff");

    expect(index._index).toEqual(clone._index);

    // Results are the same after the first search
    expect(search(index, "stuff")).toEqual(results);
  });

  it("triggers auto vacuum by default", () => {
    const index = createIndex({ fields: ["text"] });

    add(index, { id: 1, text: "Some stuff" });
    index._dirtCount = 1000;

    discard(index, 1);
    expect(index.isVacuuming).toEqual(true);
  });

  it("triggers auto vacuum when the threshold is met", () => {
    const index = createIndex({
      fields: ["text"],
      autoVacuum: {
        minDirtCount: 2,
        minDirtFactor: 0,
        batchWait: 50,
        batchSize: 1,
      },
    });
    const documents = [
      { id: 1, text: "Some stuff" },
      { id: 2, text: "Some additional stuff" },
      { id: 3, text: "Even more stuff" },
    ];

    addAll(index, documents);

    expect(index.isVacuuming).toEqual(false);

    discard(index, 1);
    expect(index.isVacuuming).toEqual(false);

    discard(index, 2);
    expect(index.isVacuuming).toEqual(true);
  });

  it("does not trigger auto vacuum if disabled", () => {
    const index = createIndex({ fields: ["text"], autoVacuum: false });
    const documents = [
      { id: 1, text: "Some stuff" },
      { id: 2, text: "Some additional stuff" },
    ];

    addAll(index, documents);
    index._dirtCount = 1000;

    discard(index, 1);
    expect(index.isVacuuming).toEqual(false);
  });

  it("applies default settings if autoVacuum is set to true", () => {
    const index = createIndex({ fields: ["text"], autoVacuum: true });
    const documents = [
      { id: 1, text: "Some stuff" },
      { id: 2, text: "Some additional stuff" },
    ];

    addAll(index, documents);
    index._dirtCount = 1000;

    discard(index, 1);
    expect(index.isVacuuming).toEqual(true);
  });

  it("applies default settings if options are set to null", async () => {
    const index = createIndex({
      fields: ["text"],
      autoVacuum: {
        // @ts-ignore
        minDirtCount: null,
        // @ts-ignore
        minDirtFactor: null,
        // @ts-ignore
        batchWait: null,
        // @ts-ignore
        batchSize: null,
      },
    });
    const documents = [
      { id: 1, text: "Some stuff" },
      { id: 2, text: "Some additional stuff" },
    ];

    addAll(index, documents);
    index._dirtCount = 1000;

    const x = discard(index, 1);

    expect(index.isVacuuming).toEqual(true);
    await x;
  });

  it("vacuums until under the dirt thresholds when called multiple times", async () => {
    const minDirtCount = 2;
    const index = createIndex({
      fields: ["text"],
      autoVacuum: {
        minDirtCount,
        minDirtFactor: 0,
        batchSize: 1,
        batchWait: 10,
      },
    });
    const documents = [];

    for (let i = 0; i < 5; i++)
      documents.push({ id: i + 1, text: `Document number ${i}` });

    addAll(index, documents);

    expect(index._dirtCount).toEqual(0);

    // Calling discard multiple times should start an auto-vacuum and enqueue
    // another, so that the remaining dirt count afterwards is always below
    // minDirtCount
    documents.forEach((doc) => discard(index, doc.id));

    while (index.isVacuuming) await index._currentVacuum;

    expect(index._dirtCount).toBeLessThan(minDirtCount);
  });

  it("does not perform unnecessary vacuuming when called multiple times", async () => {
    const minDirtCount = 2;
    const index = createIndex({
      fields: ["text"],
      autoVacuum: {
        minDirtCount,
        minDirtFactor: 0,
        batchSize: 1,
        batchWait: 10,
      },
    });
    const documents = [
      { id: 1, text: "Document one" },
      { id: 2, text: "Document two" },
      { id: 3, text: "Document three" },
    ];

    addAll(index, documents);

    // Calling discard multiple times will start an auto-vacuum and enqueue
    // another, subject to minDirtCount/minDirtFactor conditions. The last one
    // should be a no-op, as the remaining dirt count after the first auto
    // vacuum would be 1, which is below minDirtCount
    documents.forEach((doc) => discard(index, doc.id));

    while (index.isVacuuming) await index._currentVacuum;

    expect(index._dirtCount).toBe(1);
  });

  it("enqueued vacuum runs without conditions if a manual vacuum was called while enqueued", async () => {
    const minDirtCount = 2;
    const index = createIndex({
      fields: ["text"],
      autoVacuum: {
        minDirtCount,
        minDirtFactor: 0,
        batchSize: 1,
        batchWait: 10,
      },
    });
    const documents = [
      { id: 1, text: "Document one" },
      { id: 2, text: "Document two" },
      { id: 3, text: "Document three" },
    ];

    addAll(index, documents);

    // Calling discard multiple times will start an auto-vacuum and enqueue
    // another, subject to minDirtCount/minDirtFactor conditions. The last one
    // would be a no-op, as the remaining dirt count after the first auto
    // vacuum would be 1, which is below minDirtCount
    documents.forEach((doc) => discard(index, doc.id));

    // But before the enqueued vacuum is ran, we invoke a manual vacuum with
    // no conditions, so it should run even with a dirt count below
    // minDirtCount
    vacuum(index);

    while (index.isVacuuming) await index._currentVacuum;

    expect(index._dirtCount).toBe(0);
  });
});
