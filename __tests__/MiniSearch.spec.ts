// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  add,
  addAll,
  addAllAsync,
  autoSuggest,
  createIndex,
  discard,
  discardAll,
  getDefaultValue,
  getStoredFields,
  has,
  loadJSONIndex,
  search,
  remove,
  replace,
  vacuum,
} from "../src/index.js";

describe("MiniSearch", () => {
  describe("discard", () => {
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
          minDirtCount: null,
          minDirtFactor: null,
          batchWait: null,
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

  describe("discardAll", () => {
    it("prevents the documents from appearing in search results", () => {
      const index = createIndex({ fields: ["text"] });
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
      expect([1, 2, 3].map((id) => has(index, id))).toEqual([
        false,
        true,
        false,
      ]);
    });

    it("only triggers at most a single auto vacuum at the end", () => {
      const index = createIndex({
        fields: ["text"],
        autoVacuum: {
          minDirtCount: 3,
          minDirtFactor: 0,
          batchSize: 1,
          batchWait: 10,
        },
      });
      const documents = [];

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
      const index = createIndex({
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

  describe("replace", () => {
    it("replaces an existing document with a new version", () => {
      const index = createIndex({ fields: ["text"] });
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
      const index = createIndex({ fields: ["text"] });

      expect(() => {
        replace(index, { id: 1, text: "Some stuff" });
      }).toThrow(
        "MiniSearch: cannot discard document with ID 1: it is not in the index"
      );
    });
  });

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

  describe("addAll", () => {
    it("adds all the documents to the index", () => {
      const index = createIndex({ fields: ["text"] });
      const documents = [
        { id: 1, text: "Nel mezzo del cammin di nostra vita" },
        { id: 2, text: "Mi ritrovai per una selva oscura" },
      ];

      addAll(index, documents);
      expect(index.documentCount).toEqual(documents.length);
    });
  });

  describe("addAllAsync", () => {
    it("adds all the documents to the index", () => {
      const index = createIndex({ fields: ["text"] });
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
      const index = createIndex({ fields: ["text"] });
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
  });

  describe("has", () => {
    it("returns true if a document with the given ID was added to the index, false otherwise", () => {
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
      const index = createIndex({ fields: ["title", "text"] });

      addAll(index, documents);

      expect(has(index, 1)).toEqual(true);
      expect(has(index, 2)).toEqual(true);
      expect(has(index, 3)).toEqual(false);

      remove(index, {
        id: 1,
        title: "Divina Commedia",
        text: "Nel mezzo del cammin di nostra vita",
      });
      discard(index, 2);

      expect(has(index, 1)).toEqual(false);
      expect(has(index, 2)).toEqual(false);
    });

    it("works well with custom ID fields", () => {
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
      const index = createIndex({ fields: ["title", "text"], idField: "uid" });

      addAll(index, documents);

      expect(has(index, 1)).toEqual(true);
      expect(has(index, 2)).toEqual(true);
      expect(has(index, 3)).toEqual(false);

      remove(index, {
        uid: 1,
        title: "Divina Commedia",
        text: "Nel mezzo del cammin di nostra vita",
      });
      discard(index, 2);

      expect(has(index, 1)).toEqual(false);
      expect(has(index, 2)).toEqual(false);
    });
  });

  describe("getStoredFields", () => {
    it("returns the stored fields for the given document ID, or undefined if the document is not in the index", () => {
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
      const index = createIndex({
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

  describe("search", () => {
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
        lang: "it",
        category: "fiction",
      },
      {
        id: 3,
        title: "Vita Nova",
        text: "In quella parte del libro della mia memoria",
        category: "poetry",
      },
    ];
    const index = createIndex({
      fields: ["title", "text"],
      storeFields: ["lang", "category"],
    });

    addAll(index, documents);

    it("returns scored results", () => {
      const results = search(index, "vita");

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ id }) => id).sort()).toEqual([1, 3]);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it("returns stored fields in the results", () => {
      const results = search(index, "del");

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ lang }) => lang).sort()).toEqual([
        "it",
        undefined,
        undefined,
      ]);
      expect(results.map(({ category }) => category).sort()).toEqual([
        "fiction",
        "poetry",
        undefined,
      ]);
    });

    it("returns empty array if there is no match", () => {
      const results = search(index, "paguro");

      expect(results).toEqual([]);
    });

    it("returns empty array for empty search", () => {
      const results = search(index, "");

      expect(results).toEqual([]);
    });

    it("returns empty results for terms that are not in the index", () => {
      let results;

      expect(() => {
        results = search(index, "sottomarino aeroplano");
      }).not.toThrowError();
      expect(results.length).toEqual(0);
    });

    it("boosts fields", () => {
      const results = search(index, "vita", { boost: { title: 2 } });

      expect(results.map(({ id }) => id)).toEqual([3, 1]);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("computes a meaningful score when fields are named liked default properties of object", () => {
      const index = createIndex({ fields: ["constructor"] });

      add(index, { id: 1, constructor: "something" });
      add(index, { id: 2, constructor: "something else" });

      const results = search(index, "something");

      results.forEach((result) => {
        expect(Number.isFinite(result.score)).toBe(true);
      });
    });

    it("searches only selected fields", () => {
      const results = search(index, "vita", { fields: ["title"] });

      expect(results).toHaveLength(1);
      expect(results[0].id).toEqual(3);
    });

    it("searches only selected fields even if other fields are boosted", () => {
      const results = search(index, "vita", {
        fields: ["title"],
        boost: { text: 2 },
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toEqual(3);
    });

    it("combines results with OR by default", () => {
      const results = search(index, "cammin como sottomarino");

      expect(results.length).toEqual(2);
      expect(results.map(({ id }) => id)).toEqual([2, 1]);
    });

    it("combines results with AND if combineWith is AND", () => {
      const results = search(index, "vita cammin", { combineWith: "AND" });

      expect(results.length).toEqual(1);
      expect(results.map(({ id }) => id)).toEqual([1]);
      expect(
        search(index, "vita sottomarino", { combineWith: "AND" }).length
      ).toEqual(0);
      expect(
        search(index, "sottomarino vita", { combineWith: "AND" }).length
      ).toEqual(0);
    });

    it("combines results with AND_NOT if combineWith is AND_NOT", () => {
      const results = search(index, "vita cammin", { combineWith: "AND_NOT" });

      expect(results.length).toEqual(1);
      expect(results.map(({ id }) => id)).toEqual([3]);
      expect(
        search(index, "vita sottomarino", { combineWith: "AND_NOT" }).length
      ).toEqual(2);
      expect(
        search(index, "sottomarino vita", { combineWith: "AND_NOT" }).length
      ).toEqual(0);
    });

    it("returns empty results for empty search", () => {
      expect(search(index, "")).toEqual([]);
      expect(search(index, "", { combineWith: "OR" })).toEqual([]);
      expect(search(index, "", { combineWith: "AND" })).toEqual([]);
      expect(search(index, "", { combineWith: "AND_NOT" })).toEqual([]);
    });

    it("executes fuzzy search", () => {
      const results = search(index, "camin memory", { fuzzy: 2 });

      expect(results.length).toEqual(2);
      expect(results.map(({ id }) => id)).toEqual([1, 3]);
    });

    it("executes fuzzy search with maximum fuzziness", () => {
      const results = search(index, "comedia", { fuzzy: 0.6, maxFuzzy: 3 });

      expect(results.length).toEqual(1);
      expect(results.map(({ id }) => id)).toEqual([1]);
    });

    it("executes prefix search", () => {
      const results = search(index, "que", { prefix: true });

      expect(results.length).toEqual(2);
      expect(results.map(({ id }) => id)).toEqual([2, 3]);
    });

    it("combines prefix search and fuzzy search", () => {
      const results = search(index, "cammino quel", {
        fuzzy: 0.25,
        prefix: true,
      });

      expect(results.length).toEqual(3);
      expect(results.map(({ id }) => id)).toEqual([2, 1, 3]);
    });

    it("assigns weights to prefix matches and fuzzy matches", () => {
      const exact = search(index, "cammino quel");

      expect(exact.map(({ id }) => id)).toEqual([2]);

      const prefixLast = search(index, "cammino quel", {
        fuzzy: true,
        prefix: true,
        weights: { prefix: 0.1 },
      });

      expect(prefixLast.map(({ id }) => id)).toEqual([2, 1, 3]);
      expect(prefixLast[0].score).toEqual(exact[0].score);

      const fuzzyLast = search(index, "cammino quel", {
        fuzzy: true,
        prefix: true,
        weights: { fuzzy: 0.1 },
      });

      expect(fuzzyLast.map(({ id }) => id)).toEqual([2, 3, 1]);
      expect(fuzzyLast[0].score).toEqual(exact[0].score);
    });

    it("assigns weight lower than exact match to a match that is both a prefix and fuzzy match", () => {
      const index = createIndex({ fields: ["text"] });
      const documents = [
        { id: 1, text: "Poi che la gente poverella crebbe" },
        { id: 2, text: "Deus, venerunt gentes" },
      ];

      addAll(index, documents);
      expect(index.documentCount).toEqual(documents.length);

      const exact = search(index, "gente");
      const combined = search(index, "gente", { fuzzy: 0.2, prefix: true });

      expect(combined.map(({ id }) => id)).toEqual([1, 2]);
      expect(combined[0].score).toEqual(exact[0].score);
      expect(combined[1].match.gentes).toEqual(["text"]);
    });

    it("accepts a function to compute fuzzy and prefix options from term", () => {
      const fuzzy = vi.fn((term) => (term.length > 4 ? 2 : false));
      const prefix = vi.fn((term) => term.length > 4);
      const results = search(index, "quel comedia", { fuzzy, prefix });

      expect(fuzzy).toHaveBeenNthCalledWith(1, "quel", 0, ["quel", "comedia"]);
      expect(fuzzy).toHaveBeenNthCalledWith(2, "comedia", 1, [
        "quel",
        "comedia",
      ]);
      expect(prefix).toHaveBeenNthCalledWith(1, "quel", 0, ["quel", "comedia"]);
      expect(prefix).toHaveBeenNthCalledWith(2, "comedia", 1, [
        "quel",
        "comedia",
      ]);
      expect(results.length).toEqual(2);
      expect(results.map(({ id }) => id)).toEqual([2, 1]);
    });

    it("boosts documents by calling boostDocument with document ID, term, and stored fields", () => {
      const query = "divina commedia nova";
      const boostFactor = 1.234;
      const boostDocument = vi.fn((id, term) => boostFactor);
      const resultsWithoutBoost = search(index, query);
      const results = search(index, query, { boostDocument });

      expect(boostDocument).toHaveBeenCalledWith(1, "divina", {});
      expect(boostDocument).toHaveBeenCalledWith(1, "commedia", {});
      expect(boostDocument).toHaveBeenCalledWith(3, "nova", {
        category: "poetry",
      });
      expect(results[0].score).toBeCloseTo(
        resultsWithoutBoost[0].score * boostFactor
      );
    });

    it("skips document if boostDocument returns a falsy value", () => {
      const query = "vita";
      const boostDocument = vi.fn((id, term) => (id === 3 ? null : 1));
      const resultsWithoutBoost = search(index, query);
      const results = search(index, query, { boostDocument });

      expect(resultsWithoutBoost.map(({ id }) => id)).toContain(3);
      expect(results.map(({ id }) => id)).not.toContain(3);
    });

    it("uses a specific search-time tokenizer if specified", () => {
      const tokenize = (string) => string.split("X");
      const results = search(index, "divinaXcommedia", { tokenize });

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ id }) => id).sort()).toEqual([1]);
    });

    it("uses a specific search-time term processing function if specified", () => {
      const processTerm = (string) =>
        string.replace(/1/g, "i").replace(/4/g, "a").toLowerCase();
      const results = search(index, "d1v1n4", { processTerm });

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ id }) => id).sort()).toEqual([1]);
    });

    it("rejects falsy terms", () => {
      const processTerm = (term) => (term === "quel" ? null : term);
      const results = search(index, "quel commedia", { processTerm });

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ id }) => id).sort()).toEqual([1]);
    });

    it("allows processTerm to expand a single term into several terms", () => {
      const processTerm = (string) =>
        string === "divinacommedia" ? ["divina", "commedia"] : string;
      const results = search(index, "divinacommedia", { processTerm });

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ id }) => id).sort()).toEqual([1]);
    });

    it("allows custom filtering of results on the basis of stored fields", () => {
      const results = search(index, "del", {
        filter: ({ category }) => category === "poetry",
      });

      expect(results.length).toBe(1);
      expect(results.every(({ category }) => category === "poetry")).toBe(true);
    });

    it("allows customizing BM25+ parameters", () => {
      const index = createIndex({
        fields: ["text"],
        searchOptions: { bm25: { k: 1.2, b: 0.7, d: 0.5 } },
      });
      const documents = [
        { id: 1, text: "something very very very cool" },
        { id: 2, text: "something cool" },
      ];

      addAll(index, documents);

      expect(search(index, "very")[0].score).toBeGreaterThan(
        search(index, "very", { bm25: { k: 1, b: 0.7, d: 0.5 } })[0].score
      );
      expect(search(index, "something")[1].score).toBeGreaterThan(
        search(index, "something", { bm25: { k: 1.2, b: 1, d: 0.5 } })[1].score
      );
      expect(search(index, "something")[1].score).toBeGreaterThan(
        search(index, "something", { bm25: { k: 1.2, b: 0.7, d: 0.1 } })[1]
          .score
      );

      // Defaults are taken from the searchOptions passed to the constructor
      const other = createIndex({
        fields: ["text"],
        searchOptions: { bm25: { k: 1, b: 0.7, d: 0.5 } },
      });

      addAll(other, documents);

      expect(search(other, "very")).toEqual(
        search(index, "very", { bm25: { k: 1, b: 0.7, d: 0.5 } })
      );
    });

    describe("when passing a query tree", () => {
      it("searches according to the given combination", () => {
        const results = search(index, {
          combineWith: "OR",
          queries: [
            {
              combineWith: "AND",
              queries: ["vita", "cammin"],
            },
            "como sottomarino",
            {
              combineWith: "AND",
              queries: ["nova", "pappagallo"],
            },
          ],
        });

        expect(results.length).toEqual(2);
        expect(results.map(({ id }) => id)).toEqual([1, 2]);
      });

      it("uses the given options for each subquery, cascading them properly", () => {
        const results = search(index, {
          combineWith: "OR",
          fuzzy: true,
          queries: [
            {
              prefix: true,
              fields: ["title"],
              queries: ["vit"],
            },
            {
              combineWith: "AND",
              queries: ["bago", "coomo"],
            },
          ],
          weights: {
            fuzzy: 0.2,
            prefix: 0.75,
          },
        });

        expect(results.length).toEqual(2);
        expect(results.map(({ id }) => id)).toEqual([3, 2]);
      });

      it("uses the search options in the second argument as default", () => {
        const reference = search(index, {
          queries: [
            { fields: ["text"], queries: ["vita"] },
            { fields: ["title"], queries: ["promessi"] },
          ],
        });

        // Boost field
        let results = search(
          index,
          {
            queries: [
              { fields: ["text"], queries: ["vita"] },
              { fields: ["title"], queries: ["promessi"] },
            ],
          },
          { boost: { title: 2 } }
        );

        expect(results.length).toEqual(reference.length);
        expect(results.find((r) => r.id === 2).score).toBeGreaterThan(
          reference.find((r) => r.id === 2).score
        );

        // Combine with AND
        results = search(
          index,
          {
            queries: [
              { fields: ["text"], queries: ["vita"] },
              { fields: ["title"], queries: ["promessi"] },
            ],
          },
          { combineWith: "AND" }
        );

        expect(results.length).toEqual(0);

        // Combine with AND, then override it with OR
        results = search(
          index,
          {
            queries: [
              { fields: ["text"], queries: ["vita"] },
              { fields: ["title"], queries: ["promessi"] },
            ],
            combineWith: "OR",
          },
          { combineWith: "AND" }
        );

        expect(results.length).toEqual(reference.length);
      });
    });

    describe("match data", () => {
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
        {
          id: 3,
          title: "Vita Nova",
          text: "In quella parte del libro della mia memoria ... vita",
        },
      ];
      const index = createIndex({ fields: ["title", "text"] });

      addAll(index, documents);

      it("reports information about matched terms and fields", () => {
        const results = search(index, "vita nova");

        expect(results.length).toBeGreaterThan(0);
        expect(results.map(({ match }) => match)).toEqual([
          { vita: ["title", "text"], nova: ["title"] },
          { vita: ["text"] },
        ]);
        expect(results.map(({ terms }) => terms)).toEqual([
          ["vita", "nova"],
          ["vita"],
        ]);
      });

      it("reports correct info when combining terms with AND", () => {
        const results = search(index, "vita nova", { combineWith: "AND" });

        expect(results.map(({ match }) => match)).toEqual([
          { vita: ["title", "text"], nova: ["title"] },
        ]);
        expect(results.map(({ terms }) => terms)).toEqual([["vita", "nova"]]);
      });

      it("reports correct info for fuzzy and prefix queries", () => {
        const results = search(index, "vi nuova", { fuzzy: 0.2, prefix: true });

        expect(results.map(({ match }) => match)).toEqual([
          { vita: ["title", "text"], nova: ["title"] },
          { vita: ["text"] },
        ]);
        expect(results.map(({ terms }) => terms)).toEqual([
          ["vita", "nova"],
          ["vita"],
        ]);
      });

      it("reports correct info for many fuzzy and prefix queries", () => {
        const results = search(index, "vi nuova m de", {
          fuzzy: 0.2,
          prefix: true,
        });

        expect(results.map(({ match }) => match)).toEqual([
          {
            del: ["text"],
            della: ["text"],
            memoria: ["text"],
            mia: ["text"],
            vita: ["title", "text"],
            nova: ["title"],
          },
          { del: ["text"], mezzo: ["text"], vita: ["text"] },
          { del: ["text"] },
        ]);
        expect(results.map(({ terms }) => terms)).toEqual([
          ["vita", "nova", "memoria", "mia", "della", "del"],
          ["vita", "mezzo", "del"],
          ["del"],
        ]);
      });

      it("passes only the query to tokenize", () => {
        const tokenize = vi.fn((string) => string.split(/\W+/));
        const index = createIndex({
          fields: ["text", "title"],
          searchOptions: { tokenize },
        });
        const query = "some search query";

        search(index, query);
        expect(tokenize).toHaveBeenCalledWith(query);
      });

      it("passes only the term to processTerm", () => {
        const processTerm = vi.fn((term) => term.toLowerCase());
        const index = createIndex({
          fields: ["text", "title"],
          searchOptions: { processTerm },
        });
        const query = "some search query";

        search(index, query);
        query.split(/\W+/).forEach((term) => {
          expect(processTerm).toHaveBeenCalledWith(term);
        });
      });

      it("does not break when special properties of object are used as a term", () => {
        const specialWords = ["constructor", "hasOwnProperty", "isPrototypeOf"];
        const index = createIndex({ fields: ["text"] });
        const processTerm = getDefaultValue("processTerm");

        add(index, { id: 1, text: specialWords.join(" ") });

        specialWords.forEach((word) => {
          expect(() => {
            search(index, word);
          }).not.toThrowError();

          const results = search(index, word);

          expect(results[0].id).toEqual(1);
          expect(results[0].match[processTerm(word)]).toEqual(["text"]);
        });
      });
    });

    describe("movie ranking set", () => {
      const index = createIndex({
        fields: ["title", "description"],
        storeFields: ["title"],
      });

      add(index, {
        id: "tt1487931",
        title: "Khumba",
        description:
          "When half-striped zebra Khumba is blamed for the lack of rain by the rest of his insular, superstitious herd, he embarks on a daring quest to earn his stripes. In his search for the legendary waterhole in which the first zebras got their stripes, Khumba meets a quirky range of characters and teams up with an unlikely duo: overprotective wildebeest Mama V and Bradley, a self-obsessed, flamboyant ostrich. But before he can reunite with his herd, Khumba must confront Phango, a sadistic leopard who controls the waterholes and terrorizes all the animals in the Great Karoo. It's not all black-and-white in this colorful adventure with a difference.",
      });

      add(index, {
        id: "tt8737608",
        title: "Rams",
        description: "A feud between two sheep farmers.",
      });

      add(index, {
        id: "tt0983983",
        title: "Shaun the Sheep",
        description:
          "Shaun is a cheeky and mischievous sheep at Mossy Bottom farm who's the leader of the flock and always plays slapstick jokes, pranks and causes trouble especially on Farmer X and his grumpy guide dog, Bitzer.",
      });

      add(index, {
        id: "tt5174284",
        title: "Shaun the Sheep: The Farmer's Llamas",
        description:
          "At the annual County Fair, three peculiar llamas catch the eye of Shaun, who tricks the unsuspecting Farmer into buying them. At first, it's all fun and games at Mossy Bottom Farm until the trio of unruly animals shows their true colours, wreaking havoc before everyone's eyes. Now, it's up to Bitzer and Shaun to come up with a winning strategy, if they want to reclaim the farm. Can they rid the once-peaceful ranch of the troublemakers?",
      });

      add(index, {
        id: "tt0102926",
        title: "The Silence of the Lambs",
        description:
          "F.B.I. trainee Clarice Starling (Jodie Foster) works hard to advance her career, while trying to hide or put behind her West Virginia roots, of which if some knew, would automatically classify her as being backward or white trash. After graduation, she aspires to work in the agency's Behavioral Science Unit under the leadership of Jack Crawford (Scott Glenn). While she is still a trainee, Crawford asks her to question Dr. Hannibal Lecter (Sir Anthony Hopkins), a psychiatrist imprisoned, thus far, for eight years in maximum security isolation for being a serial killer who cannibalized his victims. Clarice is able to figure out the assignment is to pick Lecter's brains to help them solve another serial murder case, that of someone coined by the media as \"Buffalo Bill\" (Ted Levine), who has so far killed five victims, all located in the eastern U.S., all young women, who are slightly overweight (especially around the hips), all who were drowned in natural bodies of water, and all who were stripped of large swaths of skin. She also figures that Crawford chose her, as a woman, to be able to trigger some emotional response from Lecter. After speaking to Lecter for the first time, she realizes that everything with him will be a psychological game, with her often having to read between the very cryptic lines he provides. She has to decide how much she will play along, as his request in return for talking to him is to expose herself emotionally to him. The case takes a more dire turn when a sixth victim is discovered, this one from who they are able to retrieve a key piece of evidence, if Lecter is being forthright as to its meaning. A potential seventh victim is high profile Catherine Martin (Brooke Smith), the daughter of Senator Ruth Martin (Diane Baker), which places greater scrutiny on the case as they search for a hopefully still alive Catherine. Who may factor into what happens is Dr. Frederick Chilton (Anthony Heald), the warden at the prison, an opportunist who sees the higher profile with Catherine, meaning a higher profile for himself if he can insert himself successfully into the proceedings.",
      });

      add(index, {
        id: "tt0395479",
        title: "Boundin'",
        description:
          "In the not too distant past, a lamb lives in the desert plateau just below the snow line. He is proud of how bright and shiny his coat of wool is, so much so that it makes him want to dance, which in turn makes all the other creatures around him also want to dance. His life changes when one spring day he is captured, his wool shorn, and thrown back out onto the plateau all naked and pink. But a bounding jackalope who wanders by makes the lamb look at life a little differently in seeing that there is always something exciting in life to bound about.",
      });

      add(index, {
        id: "tt9812474",
        title: "Lamb",
        description:
          "Haunted by the indelible mark of loss and silent grief, sad-eyed María and her taciturn husband, Ingvar, seek solace in back-breaking work and the demanding schedule at their sheep farm in the remote, harsh, wind-swept landscapes of mountainous Iceland. Then, with their relationship hanging on by a thread, something unexplainable happens, and just like that, happiness blesses the couple's grim household once more. Now, as a painful ending gives birth to a new beginning, Ingvar's troubled brother, Pétur, arrives at the farmhouse, threatening María and Ingvar's delicate, newfound bliss. But, nature's gifts demand sacrifice. How far are ecstatic María and Ingvar willing to go in the name of love?",
      });

      add(index, {
        id: "tt0306646",
        title: "Ringing Bell",
        description:
          "A baby lamb named Chirin is living an idyllic life on a farm with many other sheep. Chirin is very adventurous and tends to get lost, so he wears a bell around his neck so that his mother can always find him. His mother warns Chirin that he must never venture beyond the fence surrounding the farm, because a huge black wolf lives in the mountains and loves to eat sheep. Chirin is too young and naive to take the advice to heart, until one night the wolf enters the barn and is prepared to kill Chirin, but at the last moment the lamb's mother throws herself in the way and is killed instead. The wolf leaves, and Chirin is horrified to see his mother's body. Unable to understand why his mother was killed, he becomes very angry and swears that he will go into the mountains and kill the wolf.",
      });

      add(index, {
        id: "tt1212022",
        title: "The Lion of Judah",
        description:
          "Follow the adventures of a bold lamb (Judah) and his stable friends as they try to avoid the sacrificial alter the week preceding the crucifixion of Christ. It is a heart-warming account of the Easter story as seen through the eyes of a lovable pig (Horace), a faint-hearted horse (Monty), a pedantic rat (Slink), a rambling rooster (Drake), a motherly cow (Esmay) and a downtrodden donkey (Jack). This magnificent period piece with its epic sets is a roller coaster ride of emotions. Enveloped in humor, this quest follows the animals from the stable in Bethlehem to the great temple in Jerusalem and onto the hillside of Calvary as these unlikely heroes try to save their friend. The journey weaves seamlessly through the biblical accounts of Palm Sunday, Jesus turning the tables in the temple, Peter's denial and with a tense, heart-wrenching climax, depicts the crucifixion and resurrection with gentleness and breathtaking beauty. For Judah, the lamb with the heart of a lion, it is a story of courage and faith. For Jack, the disappointed donkey, it becomes a pivotal voyage of hope. For Horace, the, well the dirty pig, and Drake the ignorant rooster, it is an opportunity to do something inappropriate and get into trouble.",
      });

      it("returns best results for lamb", () => {
        // This should be fairly easy. We test that exact matches come before
        // prefix matches, and that hits in shorter fields (title) come before
        // hits in longer fields (description)
        const hits = search(index, "lamb", { fuzzy: 1, prefix: true });

        expect(hits.map(({ title }) => title)).toEqual([
          // Exact title match.
          "Lamb",

          // Contains term twice, shortest description.
          "Boundin'",

          // Contains term twice.
          "Ringing Bell",

          // Contains term twice, longest description.
          "The Lion of Judah",

          // Prefix match in title.
          "The Silence of the Lambs",
        ]);
      });

      it("returns best results for sheep", () => {
        // This tests more complex interaction between scoring. We want hits in
        // the title to be automatically considered most relevant, because they
        // are very short, and the search term occurs less frequently in the
        // title than it does in the description. One result, 'Rams', has a very
        // short description with an exact match, but it should never outrank
        // the result with an exact match in the title AND description.
        const hits = search(index, "sheep", { fuzzy: 1, prefix: true });

        expect(hits.map(({ title }) => title)).toEqual([
          // Has 'sheep' in title and once in a description of average length.
          "Shaun the Sheep",

          // Has 'sheep' just once, in a short description.
          "Rams",

          // Contains 'sheep' just once, in a long title.
          "Shaun the Sheep: The Farmer's Llamas",

          // Has most occurrences of 'sheep'.
          "Ringing Bell",

          // Contains 'sheep' just once, in a long description.
          "Lamb",
        ]);
      });

      it("returns best results for shaun", () => {
        // Two movies contain the query in the title. Pick the shorter title.
        expect(search(index, "shaun the sheep")[0].title).toEqual(
          "Shaun the Sheep"
        );
        expect(
          search(index, "shaun the sheep", { fuzzy: 1, prefix: true })[0].title
        ).toEqual("Shaun the Sheep");
      });

      it("returns best results for chirin", () => {
        // The title contains neither 'sheep' nor the character name. Movies
        // that have 'sheep' or 'the' in the title should not outrank this.
        expect(search(index, "chirin the sheep")[0].title).toEqual(
          "Ringing Bell"
        );
        expect(
          search(index, "chirin the sheep", { fuzzy: 1, prefix: true })[0].title
        ).toEqual("Ringing Bell");
      });

      it("returns best results for judah", () => {
        // Title contains the character's name, but the word 'sheep' never
        // occurs. Other movies that do contain 'sheep' should not outrank this.
        expect(search(index, "judah the sheep")[0].title).toEqual(
          "The Lion of Judah"
        );
        expect(
          search(index, "judah the sheep", { fuzzy: 1, prefix: true })[0].title
        ).toEqual("The Lion of Judah");
      });

      it("returns best results for bounding", () => {
        // The expected hit has an exact match in the description and a fuzzy
        // match in the title, and both variations of the term are highly
        // specific. Does not contain 'sheep' at all! Because 'sheep' is a
        // slightly more common term in the dataset, that should not cause other
        // results to outrank this.
        expect(search(index, "bounding sheep", { fuzzy: 1 })[0].title).toEqual(
          "Boundin'"
        );
      });
    });

    describe("song ranking set", () => {
      const index = createIndex({
        fields: ["song", "artist"],
        storeFields: ["song"],
      });

      add(index, {
        id: "1",
        song: "Killer Queen",
        artist: "Queen",
      });

      add(index, {
        id: "2",
        song: "The Witch Queen Of New Orleans",
        artist: "Redbone",
      });

      add(index, {
        id: "3",
        song: "Waterloo",
        artist: "Abba",
      });

      add(index, {
        id: "4",
        song: "Take A Chance On Me",
        artist: "Abba",
      });

      add(index, {
        id: "5",
        song: "Help",
        artist: "The Beatles",
      });

      add(index, {
        id: "6",
        song: "Yellow Submarine",
        artist: "The Beatles",
      });

      add(index, {
        id: "7",
        song: "Dancing Queen",
        artist: "Abba",
      });

      add(index, {
        id: "8",
        song: "Bohemian Rhapsody",
        artist: "Queen",
      });

      it("returns best results for witch queen", () => {
        const hits = search(index, "witch queen", { fuzzy: 1, prefix: true });

        expect(hits.map(({ song }) => song)).toEqual([
          // The only result that has both terms. This should not be outranked
          // by hits that match only one term.
          "The Witch Queen Of New Orleans",

          // Contains just one term, but matches both song and artist.
          "Killer Queen",

          // Match on artist only. Artist is an exact match for 'Queen'.
          "Bohemian Rhapsody",

          // Match on song only. Song is a worse match for 'Queen'.
          "Dancing Queen",
        ]);
      });

      it("returns best results for queen", () => {
        // The only match where both song and artist contain 'queen'.
        expect(
          search(index, "queen", { fuzzy: 1, prefix: true })[0].song
        ).toEqual("Killer Queen");
      });
    });
  });

  describe("default tokenization", () => {
    it("splits on non-alphanumeric taking diacritics into account", () => {
      const documents = [
        {
          id: 1,
          text: `Se la vita è sventura,
perché da noi si dura?
Intatta luna, tale
è lo stato mortale.
Ma tu mortal non sei,
e forse del mio dir poco ti cale`,
        },
        {
          id: 2,
          text: 'The estimates range from roughly 1 in 100 to 1 in 100,000. The higher figures come from the working engineers, and the very low figures from management. What are the causes and consequences of this lack of agreement? Since 1 part in 100,000 would imply that one could put a Shuttle up each day for 300 years expecting to lose only one, we could properly ask "What is the cause of management\'s fantastic faith in the machinery?"',
        },
      ];
      const index = createIndex({ fields: ["text"] });

      addAll(index, documents);
      expect(search(index, "perché").length).toBeGreaterThan(0);
      expect(search(index, "perch").length).toEqual(0);
      expect(search(index, "luna").length).toBeGreaterThan(0);

      expect(search(index, "300").length).toBeGreaterThan(0);
      expect(search(index, "machinery").length).toBeGreaterThan(0);
    });

    it("supports non-latin alphabets", () => {
      const documents = [
        { id: 1, title: "София София" },
        { id: 2, title: "アネモネ" },
        { id: 3, title: "«τέχνη»" },
        { id: 4, title: "سمت  الرأس" },
        { id: 5, title: "123 45" },
      ];
      const index = createIndex({ fields: ["title"] });

      addAll(index, documents);

      expect(search(index, "софия").map(({ id }) => id)).toEqual([1]);
      expect(search(index, "アネモネ").map(({ id }) => id)).toEqual([2]);
      expect(search(index, "τέχνη").map(({ id }) => id)).toEqual([3]);
      expect(search(index, "الرأس").map(({ id }) => id)).toEqual([4]);
      expect(search(index, "123").map(({ id }) => id)).toEqual([5]);
    });
  });

  describe("autoSuggest", () => {
    const documents = [
      {
        id: 1,
        title: "Divina Commedia",
        text: "Nel mezzo del cammin di nostra vita",
        category: "poetry",
      },
      {
        id: 2,
        title: "I Promessi Sposi",
        text: "Quel ramo del lago di Como",
        category: "fiction",
      },
      {
        id: 3,
        title: "Vita Nova",
        text: "In quella parte del libro della mia memoria",
        category: "poetry",
      },
    ];
    const index = createIndex({
      fields: ["title", "text"],
      storeFields: ["category"],
    });

    addAll(index, documents);

    it("returns scored suggestions", () => {
      const results = autoSuggest(index, "com");

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ suggestion }) => suggestion)).toEqual([
        "como",
        "commedia",
      ]);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("returns empty array if there is no match", () => {
      const results = autoSuggest(index, "paguro");

      expect(results).toEqual([]);
    });

    it("returns empty array for empty search", () => {
      const results = autoSuggest(index, "");

      expect(results).toEqual([]);
    });

    it("returns scored suggestions for multi-word queries", () => {
      const results = autoSuggest(index, "vita no");

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ suggestion }) => suggestion)).toEqual([
        "vita nova",
        "vita nostra",
      ]);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("respects the order of the terms in the query", () => {
      const results = autoSuggest(index, "nostra vi");

      expect(results.map(({ suggestion }) => suggestion)).toEqual([
        "nostra vita",
      ]);
    });

    it("returns empty suggestions for terms that are not in the index", () => {
      let results;

      expect(() => {
        results = autoSuggest(index, "sottomarino aeroplano");
      }).not.toThrowError();
      expect(results.length).toEqual(0);
    });

    it("does not duplicate suggested terms", () => {
      const results = autoSuggest(index, "vita", { fuzzy: true, prefix: true });

      expect(results[0].suggestion).toEqual("vita");
      expect(results[0].terms).toEqual(["vita"]);
    });

    it("applies the given custom filter", () => {
      let results = autoSuggest(index, "que", {
        filter: ({ category }) => category === "fiction",
      });

      expect(results[0].suggestion).toEqual("quel");
      expect(results).toHaveLength(1);

      results = autoSuggest(index, "que", {
        filter: ({ category }) => category === "poetry",
      });
      expect(results[0].suggestion).toEqual("quella");
      expect(results).toHaveLength(1);
    });

    it("respects the custom defaults set in the constructor", () => {
      const index = createIndex({
        fields: ["title", "text"],
        autoSuggestOptions: { combineWith: "OR", fuzzy: true },
      });

      addAll(index, documents);
      const results = autoSuggest(index, "nosta vi");

      expect(results.map(({ suggestion }) => suggestion)).toEqual([
        "nostra vita",
        "vita",
      ]);
    });

    it("applies the default search options if not overridden by the auto suggest defaults", () => {
      const index = createIndex({
        fields: ["title", "text"],
        searchOptions: { combineWith: "OR", fuzzy: true },
      });

      addAll(index, documents);
      const results = autoSuggest(index, "nosta vi");

      expect(results.map(({ suggestion }) => suggestion)).toEqual([
        "nostra vita",
      ]);
    });
  });

  describe("loadJSON", () => {
    const documents = [
      {
        id: 1,
        title: "Divina Commedia",
        text: "Nel mezzo del cammin di nostra vita",
        category: "poetry",
      },
      {
        id: 2,
        title: "I Promessi Sposi",
        text: "Quel ramo del lago di Como",
        category: "fiction",
      },
      {
        id: 3,
        title: "Vita Nova",
        text: "In quella parte del libro della mia memoria",
        category: "poetry",
      },
    ];

    it("loads a JSON-serialized search index", () => {
      const options = { fields: ["title", "text"], storeFields: ["category"] };
      const index = createIndex(options);

      addAll(index, documents);

      const json = JSON.stringify(index);
      const deserialized = loadJSONIndex(json, options);

      expect(search(index, "vita")).toEqual(search(deserialized, "vita"));

      const original = index.toJSON();
      const final = deserialized.toJSON();

      // Normalize order of data in the serialized index
      original.index.sort();
      final.index.sort();

      expect(original).toEqual(final);
    });

    it("raises an error if called without options", () => {
      const options = { fields: ["title", "text"] };
      const index = createIndex(options);

      addAll(index, documents);
      const json = JSON.stringify(index);

      expect(() => {
        loadJSONIndex(json);
      }).toThrowError(
        "MiniSearch: loadJSON should be given the same options used when serializing the index"
      );
    });

    it("raises an error if given an incompatible serialized version", () => {
      const options = { fields: ["title", "text"] };
      const json = "{}";

      expect(() => {
        loadJSONIndex(json, options);
      }).toThrowError(
        "MiniSearch: cannot deserialize an index created with an incompatible version"
      );
    });

    it("is compatible with serializationVersion 1", () => {
      const options = { fields: ["title", "text"], storeFields: ["category"] };
      const jsonV1 =
        '{"documentCount":3,"nextId":3,"documentIds":{"0":1,"1":2,"2":3},"fieldIds":{"title":0,"text":1},"fieldLength":{"0":[2,7],"1":[3,6],"2":[2,8]},"averageFieldLength":[2.3333333333333335,7],"storedFields":{"0":{"category":"poetry"},"1":{"category":"fiction"},"2":{"category":"poetry"}},"index":[["memoria",{"1":{"df":1,"ds":{"2":1}}}],["mezzo",{"1":{"df":1,"ds":{"0":1}}}],["mia",{"1":{"df":1,"ds":{"2":1}}}],["libro",{"1":{"df":1,"ds":{"2":1}}}],["lago",{"1":{"df":1,"ds":{"1":1}}}],["parte",{"1":{"df":1,"ds":{"2":1}}}],["promessi",{"0":{"df":1,"ds":{"1":1}}}],["ramo",{"1":{"df":1,"ds":{"1":1}}}],["quella",{"1":{"df":1,"ds":{"2":1}}}],["quel",{"1":{"df":1,"ds":{"1":1}}}],["sposi",{"0":{"df":1,"ds":{"1":1}}}],["in",{"1":{"df":1,"ds":{"2":1}}}],["i",{"0":{"df":1,"ds":{"1":1}}}],["vita",{"0":{"df":1,"ds":{"2":1}},"1":{"df":1,"ds":{"0":1}}}],["nova",{"0":{"df":1,"ds":{"2":1}}}],["nostra",{"1":{"df":1,"ds":{"0":1}}}],["nel",{"1":{"df":1,"ds":{"0":1}}}],["como",{"1":{"df":1,"ds":{"1":1}}}],["commedia",{"0":{"df":1,"ds":{"0":1}}}],["cammin",{"1":{"df":1,"ds":{"0":1}}}],["di",{"1":{"df":2,"ds":{"0":1,"1":1}}}],["divina",{"0":{"df":1,"ds":{"0":1}}}],["della",{"1":{"df":1,"ds":{"2":1}}}],["del",{"1":{"df":3,"ds":{"0":1,"1":1,"2":1}}}]],"serializationVersion":1}';

      const index1 = loadJSONIndex(jsonV1, options);
      const index2 = createIndex(options);

      addAll(index2, documents);

      const original = index1.toJSON();
      const expected = index2.toJSON();

      // Normalize order of data in the serialized index
      original.index.sort();
      expected.index.sort();

      expect(original).toEqual(expected);
    });
  });

  describe("getDefault", () => {
    it("returns the default value of the given option", () => {
      expect(getDefaultValue("idField")).toEqual("id");
      expect(getDefaultValue("extractField")).toBeInstanceOf(Function);
      expect(getDefaultValue("tokenize")).toBeInstanceOf(Function);
      expect(getDefaultValue("processTerm")).toBeInstanceOf(Function);
      expect(getDefaultValue("searchOptions")).toBe(undefined);
      expect(getDefaultValue("fields")).toBe(undefined);
    });

    it("throws an error if there is no option with the given name", () => {
      expect(() => {
        getDefaultValue("foo");
      }).toThrowError('MiniSearch: unknown option "foo"');
    });
  });
});
