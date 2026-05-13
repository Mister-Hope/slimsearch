import { describe, expect, it } from "vitest";

import { addAll, createIndex, loadJSONIndex, loadJSONIndexAsync, search } from "../src/index.js";

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

describe(loadJSONIndex, () => {
  it("loads a JSON-serialized search index", () => {
    const options = { fields: ["title", "text"], storeFields: ["category"] };
    const index = createIndex<number, Document>(options);

    addAll(index, documents);

    const json = JSON.stringify(index);
    const deserialized = loadJSONIndex(json, options);

    expect(search(index, "vita")).toStrictEqual(search(deserialized, "vita"));

    const original = index.toJSON();
    const final = deserialized.toJSON();

    // Normalize order of data in the serialized index
    original.index.sort();
    final.index.sort();

    expect(original).toStrictEqual(final);
  });

  it("raises an error if called without options", () => {
    const options = { fields: ["title", "text"] };
    const index = createIndex<number, Document>(options);

    addAll(index, documents);
    const json = JSON.stringify(index);

    expect(() => {
      // @ts-expect-error: options is missing
      loadJSONIndex(json);
    }).toThrow(
      "SlimSearch: loadJSONIndex should be given the same options used when serializing the index",
    );
  });

  it("raises an error if given an incompatible serialized version", () => {
    const options = { fields: ["title", "text"] };
    const json = "{}";

    expect(() => {
      loadJSONIndex(json, options);
    }).toThrow("SlimSearch: cannot deserialize an index created with an incompatible version");
  });
});

describe("loadJSONAsync", () => {
  const documentsForAsync = [
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

  it("create a index that is identical to .loadJSON()", async () => {
    const options = { fields: ["title", "text"], storeFields: ["category"] };

    const index = createIndex<number, Document>(options);

    addAll(index, documentsForAsync);
    const json = JSON.stringify(index);

    const deserializedAsync = await loadJSONIndexAsync(json, options);
    const deserialized = loadJSONIndex(json, options);

    expect(deserialized).toStrictEqual(deserializedAsync);
  });

  it("raises an error if called without options", () => {
    const options = { fields: ["title", "text"] };
    const index = createIndex<number, Document>(options);

    addAll(index, documentsForAsync);
    const json = JSON.stringify(index);

    expect(() =>
      // @ts-expect-error: options is missing
      loadJSONIndexAsync(json),
    ).toThrow(
      "SlimSearch: loadJSONIndexAsync should be given the same options used when serializing the index",
    );
  });

  it("handles large index with pauses", async () => {
    const options = { fields: ["text"] };

    // Construct a valid index object with >1000 terms to trigger
    // the modulo-1000 pause branch in loadIndexAsync
    const index: [string, Record<string, Record<string, number>>][] = [];

    for (let i = 0; i < 1001; i++) index.push([`term${i}`, { "0": { "0": 1 } }]);

    const json = JSON.stringify({
      version: 2,
      documentCount: 1,
      nextId: 1,
      fieldIds: { text: 0 },
      averageFieldLength: [1],
      dirtCount: 0,
      index,
      documentIds: { "0": "doc1" },
      fieldLength: { "0": [1] },
      storedFields: { "0": {} },
    });

    const result = await loadJSONIndexAsync(json, options);

    expect(result.documentCount).toBe(1);
    expect(result._index.size).toBe(1001);
  });

  it("handles missing dirtCount in serialized index", () => {
    const options = { fields: ["title", "text"] };
    const index = createIndex<number, Document>(options);

    addAll(index, [
      {
        id: 1,
        title: "Divina Commedia",
        text: "Nel mezzo del cammin di nostra vita",
        category: "",
      },
    ]);

    const obj = index.toJSON();

    delete obj.dirtCount;

    const deserialized = loadJSONIndex(JSON.stringify(obj), options);

    expect(deserialized._dirtCount).toBe(0);
  });
});
