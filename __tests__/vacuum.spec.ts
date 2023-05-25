import { describe, expect, it } from "vitest";

import {
  add,
  addAll,
  createIndex,
  discard,
  loadJSONIndex,
  remove,
  vacuum,
} from "../src/index.js";

describe("vacuum", () => {
  it("cleans up discarded documents from the index", async () => {
    const index = createIndex({ fields: ["text"], storeFields: ["text"] });
    const documents = [
      { id: 1, text: "Some stuff" },
      { id: 2, text: "Some additional stuff" },
    ];

    addAll(index, documents);
    const clone = loadJSONIndex(JSON.stringify(index), {
      fields: ["text"],
      storeFields: ["text"],
    });

    discard(index, 1);
    discard(index, 2);
    remove(clone, { id: 1, text: "Some stuff" });
    remove(clone, { id: 2, text: "Some additional stuff" });

    expect(index).not.toEqual(clone);

    await vacuum(index, { batchSize: 1 });

    expect(index).toEqual(clone);
    expect(index.isVacuuming).toEqual(false);
  });

  it("schedules a second vacuum right after the current one completes, if one is ongoing", async () => {
    const index = createIndex({ fields: ["text"] });
    const empty = loadJSONIndex(JSON.stringify(index), {
      fields: ["text"],
    });
    const documents = [
      { id: 1, text: "Some stuff" },
      { id: 2, text: "Some additional stuff" },
    ];

    addAll(index, documents);

    discard(index, 1);
    discard(index, 2);
    add(index, { id: 3, text: "Even more stuff" });

    vacuum(index, { batchSize: 1, batchWait: 50 });
    discard(index, 3);

    await vacuum(index);

    expect(index._index).toEqual(empty._index);
    expect(index.isVacuuming).toEqual(false);
  });

  it("does not enqueue more than one vacuum on top of the ongoing one", async () => {
    const index = createIndex({ fields: ["text"] });
    const documents = [
      { id: 1, text: "Some stuff" },
      { id: 2, text: "Some additional stuff" },
    ];

    addAll(index, documents);
    discard(index, 1);
    discard(index, 2);

    const a = vacuum(index, { batchSize: 1, batchWait: 50 });
    const b = vacuum(index);
    const c = vacuum(index);

    expect(a).not.toBe(b);
    expect(b).toBe(c);
    expect(index.isVacuuming).toEqual(true);

    await c;

    expect(index.isVacuuming).toEqual(false);
  });

  it("allows batch size to be bigger than the term count", async () => {
    const index = createIndex({ fields: ["text"] });
    const documents = [
      { id: 1, text: "Some stuff" },
      { id: 2, text: "Some additional stuff" },
    ];

    addAll(index, documents);
    await vacuum(index, { batchSize: index.termCount + 1 });
    expect(index.isVacuuming).toEqual(false);
  });
});
