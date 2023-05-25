import { describe, expect, it } from "vitest";

import { addAll, createIndex, loadJSONIndex, search } from "../src/index.js";

describe("loadJSONIndex()", () => {
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
      // @ts-expect-error
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
