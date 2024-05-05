import { expect, it } from "vitest";

import type { Suggestion } from "../src/index.js";
import { addAll, autoSuggest, createIndex } from "../src/index.js";

interface Document {
  id: number;
  text: string;
  title: string;
  category: string;
}

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
const index = createIndex<number, Document, { category: string }>({
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

  expect(results.map(({ suggestion }) => suggestion)).toEqual(["nostra vita"]);
});

it("returns empty suggestions for terms that are not in the index", () => {
  let results: Suggestion[] | null = null;

  expect(() => {
    results = autoSuggest(index, "sottomarino aeroplano");
  }).not.toThrowError();
  expect(results!.length).toEqual(0);
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
  const index = createIndex<number, Document>({
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
  const index = createIndex<number, Document>({
    fields: ["title", "text"],
    searchOptions: { combineWith: "OR", fuzzy: true },
  });

  addAll(index, documents);
  const results = autoSuggest(index, "nosta vi");

  expect(results.map(({ suggestion }) => suggestion)).toEqual(["nostra vita"]);
});
