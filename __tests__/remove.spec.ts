// oxlint-disable vitest/max-expects
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchIndex, SearchIndexOptions } from "../src/index.js";
import { add, addAll, createIndex, getDefaultValue, remove, search } from "../src/index.js";

describe(remove, () => {
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

  let index: SearchIndex<number, Document>;

  // oxlint-disable-next-line vitest/no-hooks
  beforeEach(() => {
    index = createIndex({ fields: ["title", "text"] });
    addAll(index, documents);
  });

  it("removes the document from the index", () => {
    const warn = vi.spyOn(console, "warn");

    expect(index.documentCount).toBe(3);
    remove(index, documents[0]);
    expect(index.documentCount).toBe(2);
    expect(search(index, "commedia")).toHaveLength(0);
    expect(search(index, "vita").map(({ id }) => id)).toStrictEqual([3]);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it("cleans up all data of the deleted document", () => {
    const otherDocument = {
      id: 4,
      title: "Decameron",
      text: "Umana cosa è aver compassione degli afflitti",
    };
    const originalFieldLength = new Map(index._fieldLength);
    const originalAverageFieldLength = [...index._avgFieldLength];

    add(index, otherDocument);
    remove(index, otherDocument);

    expect(index.documentCount).toBe(3);
    expect(index._fieldLength).toStrictEqual(originalFieldLength);
    expect(index._avgFieldLength).toStrictEqual(originalAverageFieldLength);
  });

  it("does not remove terms from other documents", () => {
    remove(index, documents[0]);
    expect(search(index, "cammin")).toHaveLength(1);
  });

  it("removes re-added document", () => {
    const warn = vi.spyOn(console, "warn");

    remove(index, documents[0]);
    add(index, documents[0]);
    remove(index, documents[0]);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it("removes documents when using a custom extractField", () => {
    interface TestDocument {
      id: number;
      text: { value: string };
    }
    const extractField = (document: TestDocument, fieldName: string): string => {
      const path = fieldName.split(".");

      return path.reduce(
        // @ts-expect-error: untyped property
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        (doc, key) => doc[key],
        document,
      ) as unknown as string;
    };
    const testIndex = createIndex<number, TestDocument>({
      fields: ["text.value"],
      storeFields: ["id"],
      extractField,
    });
    const document = {
      id: 123,
      text: { value: "Nel mezzo del cammin di nostra vita" },
    };

    add(testIndex, document);

    expect(() => {
      remove(testIndex, document);
    }).not.toThrow();

    expect(search(testIndex, "vita")).toStrictEqual([]);
  });

  it("cleans up the index", () => {
    const originalIdsSize = index._documentIds.size;

    remove(index, documents[0]);
    expect(index._index.has("commedia")).toBe(false);
    expect(index._documentIds.size).toStrictEqual(originalIdsSize - 1);
    expect([...index._index.get("vita")!.keys()]).toStrictEqual([index._fieldIds.title]);
  });

  it("throws error if the document does not have the ID field", () => {
    const testIndex = createIndex<{ foo: string; text: string; title: string }, string>({
      idField: "foo",
      fields: ["title", "text"],
    });

    expect(() => {
      // @ts-expect-error: document does not have ID field
      remove(testIndex, { text: "I do not have an ID" });
    }).toThrow('SlimSearch: document does not have ID field "foo"');
  });

  it("extracts the ID field using extractField", () => {
    interface TestDocument {
      id: { value: number };
      text: string;
    }

    const extractField = (document: TestDocument, fieldName: string): string => {
      // @ts-expect-error: id could be number
      if (fieldName === "id") return document.id.value;

      return (
        getDefaultValue("extractField") as (document: TestDocument, fieldName: string) => string
      )(document, fieldName);
    };
    const testIndex = createIndex<number, TestDocument>({
      fields: ["text"],
      extractField,
    });
    const document = {
      id: { value: 123 },
      text: "Nel mezzo del cammin di nostra vita",
    };

    add(testIndex, document);

    expect(() => {
      remove(testIndex, document);
    }).not.toThrow();

    expect(search(testIndex, "vita")).toStrictEqual([]);
  });

  it("does not crash when the document has field named like default properties of object", () => {
    const testIndex = createIndex<number, { id: number }>({
      fields: ["constructor"],
    });
    const document = { id: 1 };

    add(testIndex, document);

    expect(() => {
      remove(testIndex, document);
    }).not.toThrow();
  });

  it("does not reassign IDs", () => {
    remove(index, documents[0]);
    add(index, documents[0]);
    expect(search(index, "commedia").map((result) => result.id)).toStrictEqual([documents[0].id]);
    expect(search(index, "nova").map((result) => result.id)).toStrictEqual([
      documents[documents.length - 1].id,
    ]);
  });

  it("rejects falsy terms", () => {
    interface TestDoc {
      id: number;
      title: string;
    }
    const processTerm = (term: string): string | null => (term === "foo" ? null : term);
    const testIndex = createIndex<number, TestDoc>({
      fields: ["title", "text"],
      processTerm,
    });
    const document = { id: 123, title: "foo bar" };

    add(testIndex, document);
    expect(() => {
      remove(testIndex, document);
    }).not.toThrow();
  });

  it("allows processTerm to expand a single term into several terms", () => {
    interface TestDoc {
      id: number;
      title: string;
    }
    const processTerm = (term: string): string[] | string =>
      term === "foobar" ? ["foo", "bar"] : term;
    const testIndex = createIndex<number, TestDoc>({
      fields: ["title", "text"],
      processTerm,
    });
    const document = { id: 123, title: "foobar" };

    add(testIndex, document);
    expect(() => {
      remove(testIndex, document);
    }).not.toThrow();

    expect(search(testIndex, "bar")).toHaveLength(0);
  });

  describe("when using custom per-field extraction/tokenizer/processing", () => {
    interface TestDoc {
      id: number;
      title: string;
      tags: string[];
      author: {
        name: string;
      };
      available: boolean;
    }
    const testDocs: TestDoc[] = [
      {
        id: 1,
        title: "Divina Commedia",
        tags: ["dante", "virgilio"],
        author: { name: "Dante Alighieri" },
        available: true,
      },
      {
        id: 2,
        title: "I Promessi Sposi",
        tags: ["renzo", "lucia"],
        author: { name: "Alessandro Manzoni" },
        available: false,
      },
      {
        id: 3,
        title: "Vita Nova",
        tags: ["dante"],
        author: { name: "Dante Alighieri" },
        available: true,
      },
    ];

    const options: SearchIndexOptions<number, TestDoc> = {
      fields: ["title", "tags", "authorName", "available"],
      extractField: (doc, fieldName) => {
        if (fieldName === "authorName") return doc.author.name;

        // @ts-expect-error: untyped property
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return doc[fieldName];
      },
      stringifyField: (fieldValue: any, fieldName: string) => {
        if (fieldName === "available") {
          // oxlint-disable-next-line typescript/strict-boolean-expressions
          return fieldValue ? "yes" : "no";
        }

        // oxlint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-return
        return fieldValue.toString();
      },
      tokenize: (field, fieldName) => {
        if (fieldName === "tags") return field.split(",");

        return field.split(/\s+/u);
      },
      processTerm: (term, fieldName) => {
        if (fieldName === "tags") return term.toUpperCase();

        return term.toLowerCase();
      },
    };

    let testIndex: SearchIndex<number, TestDoc>;

    // oxlint-disable-next-line vitest/no-hooks
    beforeEach(() => {
      testIndex = createIndex(options);
      addAll(testIndex, testDocs);
    });

    it("removes the document and its terms from the index", () => {
      const warn = vi.spyOn(console, "warn");

      expect(testIndex.documentCount).toBe(3);
      expect(search(testIndex, "commedia").map(({ id }) => id)).toStrictEqual([1]);
      expect(search(testIndex, "DANTE").map(({ id }) => id)).toStrictEqual([1, 3]);
      expect(search(testIndex, "vita").map(({ id }) => id)).toStrictEqual([3]);
      expect(search(testIndex, "yes").map(({ id }) => id)).toStrictEqual([1, 3]);

      remove(testIndex, testDocs[0]);

      expect(testIndex.documentCount).toBe(2);
      expect(search(testIndex, "commedia").map(({ id }) => id)).toStrictEqual([]);
      expect(search(testIndex, "DANTE").map(({ id }) => id)).toStrictEqual([3]);
      expect(search(testIndex, "vita").map(({ id }) => id)).toStrictEqual([3]);
      expect(search(testIndex, "yes").map(({ id }) => id)).toStrictEqual([3]);
      expect(search(testIndex, "vita").map(({ id }) => id)).toStrictEqual([3]);
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    });
  });

  describe("when the document was not in the index", () => {
    it("throws an error", () => {
      expect(() => {
        // @ts-expect-errorF: id could be number
        remove(index, { id: 99 });
      }).toThrow("SlimSearch: cannot remove document with ID 99: it is not in the index");
    });
  });

  describe("when the document has changed", () => {
    it("warns of possible index corruption", () => {
      const warn = vi.spyOn(console, "warn");

      expect(() => {
        remove(index, {
          id: 1,
          title: "Divina Commedia cammin",
          text: "something has changed",
        });
      }).not.toThrow();

      expect(warn).toHaveBeenCalledTimes(4);
      [
        ["cammin", "title"],
        ["something", "text"],
        ["has", "text"],
        ["changed", "text"],
      ].forEach(([term, field], i) => {
        expect(warn).toHaveBeenNthCalledWith(
          i + 1,
          `SlimSearch: document with ID 1 has changed before removal: term "${term}" was not present in field "${field}". Removing a document after it has changed can corrupt the index!`,
        );
      });

      warn.mockRestore();
    });

    it("calls the custom logger if given", () => {
      const logger = vi.fn<() => void>();
      const warn = vi.spyOn(console, "warn");

      index = createIndex({ fields: ["title", "text"], logger });
      addAll(index, documents);
      remove(index, { id: 1, title: "Divina Commedia", text: "something" });

      expect(logger).toHaveBeenCalledWith(
        "warn",
        'SlimSearch: document with ID 1 has changed before removal: term "something" was not present in field "text". Removing a document after it has changed can corrupt the index!',
        "version_conflict",
      );
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    });
  });
});
