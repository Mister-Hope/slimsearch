import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchIndex } from "../src/index.js";
import {
  addAll,
  createIndex,
  loadJSONIndex,
  removeAll,
  search,
} from "../src/index.js";

describe("removeAll()", () => {
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

  let index: SearchIndex<Document, number>, _warn: (...args: any[]) => void;

  beforeEach(() => {
    index = createIndex({ fields: ["title", "text"] });
    _warn = console.warn;
    console.warn = vi.fn();
  });

  afterEach(() => {
    console.warn = _warn;
  });

  it("removes all documents from the index if called with no argument", () => {
    const empty = loadJSONIndex(JSON.stringify(index), {
      fields: ["title", "text"],
    });

    addAll(index, documents);
    expect(index.documentCount).toEqual(3);

    removeAll(index);

    expect(index).toEqual(empty);
  });

  it("removes the given documents from the index", () => {
    addAll(index, documents);
    expect(index.documentCount).toEqual(3);

    removeAll(index, [documents[0], documents[2]]);

    expect(index.documentCount).toEqual(1);
    expect(search(index, "commedia").length).toEqual(0);
    expect(search(index, "vita").length).toEqual(0);
    expect(search(index, "lago").length).toEqual(1);
  });

  it("raises an error if called with a falsey argument", () => {
    expect(() => {
      // @ts-expect-error: Wrong param
      removeAll(index, null);
    }).toThrowError();
    expect(() => {
      removeAll(index, undefined);
    }).toThrowError();
    expect(() => {
      // @ts-expect-error: Wrong param
      removeAll(index, false);
    }).toThrowError();
    expect(() => {
      removeAll(index, []);
    }).not.toThrowError();
  });
});
