import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SearchIndex,
  add,
  addAll,
  createIndex,
  getDefaultValue,
  remove,
  search,
} from "../src/index.js";

describe("remove()", () => {
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

  let index: SearchIndex, _warn: (...args: any[]) => void;

  beforeEach(() => {
    index = createIndex({ fields: ["title", "text"] });
    addAll(index, documents);
    _warn = console.warn;
    console.warn = vi.fn();
  });

  afterEach(() => {
    console.warn = _warn;
  });

  it("removes the document from the index", () => {
    expect(index.documentCount).toEqual(3);
    remove(index, documents[0]);
    expect(index.documentCount).toEqual(2);
    expect(search(index, "commedia").length).toEqual(0);
    expect(search(index, "vita").map(({ id }) => id)).toEqual([3]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("cleans up all data of the deleted document", () => {
    const otherDocument = {
      id: 4,
      title: "Decameron",
      text: "Umana cosa è aver compassione degli afflitti",
    };
    const originalFieldLength = new Map(index._fieldLength);
    const originalAverageFieldLength = index._avgFieldLength.slice();

    add(index, otherDocument);
    remove(index, otherDocument);

    expect(index.documentCount).toEqual(3);
    expect(index._fieldLength).toEqual(originalFieldLength);
    expect(index._avgFieldLength).toEqual(originalAverageFieldLength);
  });

  it("does not remove terms from other documents", () => {
    remove(index, documents[0]);
    expect(search(index, "cammin").length).toEqual(1);
  });

  it("removes re-added document", () => {
    remove(index, documents[0]);
    add(index, documents[0]);
    remove(index, documents[0]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("removes documents when using a custom extractField", () => {
    const extractField = (document: any, fieldName: string) => {
      const path = fieldName.split(".");

      return path.reduce((doc, key) => doc && doc[key], document);
    };
    const index = createIndex({
      fields: ["text.value"],
      storeFields: ["id"],
      extractField,
    });
    const document = {
      id: 123,
      text: { value: "Nel mezzo del cammin di nostra vita" },
    };

    add(index, document);

    expect(() => {
      remove(index, document);
    }).not.toThrowError();

    expect(search(index, "vita")).toEqual([]);
  });

  it("cleans up the index", () => {
    const originalIdsSize = index._documentIds.size;

    remove(index, documents[0]);
    expect(index._index.has("commedia")).toEqual(false);
    expect(index._documentIds.size).toEqual(originalIdsSize - 1);
    expect(Array.from(index._index.get("vita")!.keys())).toEqual([
      index._fieldIds.title,
    ]);
  });

  it("throws error if the document does not have the ID field", () => {
    const index = createIndex({ idField: "foo", fields: ["title", "text"] });

    expect(() => {
      remove(index, { text: "I do not have an ID" });
    }).toThrowError('SlimSearch: document does not have ID field "foo"');
  });

  it("extracts the ID field using extractField", () => {
    const extractField = (document: any, fieldName: string) => {
      if (fieldName === "id") return document.id.value;

      return getDefaultValue("extractField")(document, fieldName);
    };
    const index = createIndex({ fields: ["text"], extractField });
    const document = {
      id: { value: 123 },
      text: "Nel mezzo del cammin di nostra vita",
    };

    add(index, document);

    expect(() => {
      remove(index, document);
    }).not.toThrowError();

    expect(search(index, "vita")).toEqual([]);
  });

  it("does not crash when the document has field named like default properties of object", () => {
    const index = createIndex({ fields: ["constructor"] });
    const document = { id: 1 };

    add(index, document);

    expect(() => {
      remove(index, document);
    }).not.toThrowError();
  });

  it("does not reassign IDs", () => {
    remove(index, documents[0]);
    add(index, documents[0]);
    expect(search(index, "commedia").map((result) => result.id)).toEqual([
      documents[0].id,
    ]);
    expect(search(index, "nova").map((result) => result.id)).toEqual([
      documents[documents.length - 1].id,
    ]);
  });

  it("rejects falsy terms", () => {
    const processTerm = (term: string) => (term === "foo" ? null : term);
    const index = createIndex({ fields: ["title", "text"], processTerm });
    const document = { id: 123, title: "foo bar" };

    add(index, document);
    expect(() => {
      remove(index, document);
    }).not.toThrowError();
  });

  it("allows processTerm to expand a single term into several terms", () => {
    const processTerm = (term: string) =>
      term === "foobar" ? ["foo", "bar"] : term;
    const index = createIndex({ fields: ["title", "text"], processTerm });
    const document = { id: 123, title: "foobar" };

    add(index, document);
    expect(() => {
      remove(index, document);
    }).not.toThrowError();

    expect(search(index, "bar")).toHaveLength(0);
  });

  describe("when using custom per-field extraction/tokenizer/processing", () => {
    const documents = [
      {
        id: 1,
        title: "Divina Commedia",
        tags: "dante,virgilio",
        author: { name: "Dante Alighieri" },
      },
      {
        id: 2,
        title: "I Promessi Sposi",
        tags: "renzo,lucia",
        author: { name: "Alessandro Manzoni" },
      },
      { id: 3, title: "Vita Nova", author: { name: "Dante Alighieri" } },
    ];

    let index: SearchIndex, _warn: (...args: any[]) => void;

    beforeEach(() => {
      index = createIndex({
        fields: ["title", "tags", "authorName"],
        extractField: (doc, fieldName) => {
          if (fieldName === "authorName") return doc.author.name;
          else return doc[fieldName];
        },
        tokenize: (field, fieldName) => {
          if (fieldName === "tags") return field.split(",");
          else return field.split(/\s+/);
        },
        processTerm: (term, fieldName) => {
          if (fieldName === "tags") return term.toUpperCase();
          else return term.toLowerCase();
        },
      });
      addAll(index, documents);
      _warn = console.warn;
      console.warn = vi.fn();
    });

    afterEach(() => {
      console.warn = _warn;
    });

    it("removes the document from the index", () => {
      expect(index.documentCount).toEqual(3);
      remove(index, documents[0]);
      expect(index.documentCount).toEqual(2);
      expect(search(index, "commedia").length).toEqual(0);
      expect(search(index, "vita").map(({ id }) => id)).toEqual([3]);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("when the document was not in the index", () => {
    it("throws an error", () => {
      expect(() => remove(index, { id: 99 })).toThrow(
        "SlimSearch: cannot remove document with ID 99: it is not in the index"
      );
    });
  });

  describe("when the document has changed", () => {
    it("warns of possible index corruption", () => {
      expect(() =>
        remove(index, {
          id: 1,
          title: "Divina Commedia cammin",
          text: "something has changed",
        })
      ).not.toThrow();
      expect(console.warn).toHaveBeenCalledTimes(4);
      [
        ["cammin", "title"],
        ["something", "text"],
        ["has", "text"],
        ["changed", "text"],
      ].forEach(([term, field], i) => {
        expect(console.warn).toHaveBeenNthCalledWith(
          i + 1,
          `SlimSearch: document with ID 1 has changed before removal: term "${term}" was not present in field "${field}". Removing a document after it has changed can corrupt the index!`
        );
      });
    });

    it("does not throw error if console.warn is undefined", () => {
      // @ts-expect-error
      console.warn = undefined;
      expect(() =>
        remove(index, {
          id: 1,
          title: "Divina Commedia cammin",
          text: "something has changed",
        })
      ).not.toThrow();
    });

    it("calls the custom logger if given", () => {
      const logger = vi.fn();

      index = createIndex({ fields: ["title", "text"], logger });
      addAll(index, documents);
      remove(index, { id: 1, title: "Divina Commedia", text: "something" });

      expect(logger).toHaveBeenCalledWith(
        "warn",
        'SlimSearch: document with ID 1 has changed before removal: term "something" was not present in field "text". Removing a document after it has changed can corrupt the index!',
        "version_conflict"
      );
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
