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
    const index = createIndex<number, Document>(options);

    addAll(index, documents);
    const json = JSON.stringify(index);

    expect(() => {
      // @ts-expect-error: options is missing
      loadJSONIndex(json);
    }).toThrowError(
      "SlimSearch: loadJSONIndex should be given the same options used when serializing the index",
    );
  });

  it("raises an error if given an incompatible serialized version", () => {
    const options = { fields: ["title", "text"] };
    const json = "{}";

    expect(() => {
      loadJSONIndex(json, options);
    }).toThrowError("SlimSearch: cannot deserialize an index created with an incompatible version");
  });
});

describe("loadJSONAsync", () => {
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

  it("create a index that is identical to .loadJSON()", async () => {
    const options = { fields: ["title", "text"], storeFields: ["category"] };

    const index = createIndex<number, Document>(options);

    addAll(index, documents);
    const json = JSON.stringify(index);

    const deserializedAsync = await loadJSONIndexAsync(json, options);
    const deserialized = loadJSONIndex(json, options);

    expect(deserialized).toEqual(deserializedAsync);
  });
});
