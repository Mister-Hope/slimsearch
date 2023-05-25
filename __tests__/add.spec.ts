import { describe, expect, it, vi } from "vitest";

import { add, createIndex, getDefaultValue, search } from "../src/index.js";

interface Index {
  id: number;
  text: string;
}

describe("add()", () => {
  it("adds the document to the index", () => {
    const index = createIndex<Index>({
      fields: ["text"],
    });

    add(index, { id: 1, text: "Nel mezzo del cammin di nostra vita" });
    expect(index.documentCount).toEqual(1);
  });

  it("does not throw error if a field is missing", () => {
    const index = createIndex<Index>({ fields: ["title", "text"] });

    add(index, { id: 1, text: "Nel mezzo del cammin di nostra vita" });
    expect(index.documentCount).toEqual(1);
  });

  it("throws error if the document does not have the ID field", () => {
    const index = createIndex({ idField: "foo", fields: ["title", "text"] });

    expect(() => {
      add(index, { text: "I do not have an ID" });
    }).toThrowError('MiniSearch: document does not have ID field "foo"');
  });

  it("throws error on duplicate ID", () => {
    const index = createIndex({ idField: "foo", fields: ["title", "text"] });

    add(index, { foo: "abc", text: "Something" });

    expect(() => {
      add(index, { foo: "abc", text: "I have a duplicate ID" });
    }).toThrowError("MiniSearch: duplicate ID abc");
  });

  it("extracts the ID field using extractField", () => {
    const extractField = (document: any, fieldName: string) => {
      if (fieldName === "id") return document.id.value;

      return getDefaultValue("extractField")(document, fieldName);
    };
    const index = createIndex({ fields: ["text"], extractField });

    add(index, {
      id: { value: 123 },
      text: "Nel mezzo del cammin di nostra vita",
    });

    const results = search(index, "vita");

    expect(results[0].id).toEqual(123);
  });

  it("rejects falsy terms", () => {
    const processTerm = (term: string) => (term === "foo" ? null : term);
    const index = createIndex({ fields: ["title", "text"], processTerm });

    expect(() => {
      add(index, { id: 123, text: "foo bar" });
    }).not.toThrowError();
  });

  it("turns the field to string before tokenization", () => {
    const tokenize = vi.fn((x) => x.split(/\W+/));
    const index = createIndex({
      fields: ["id", "tags", "isBlinky"],
      tokenize,
    });

    expect(() => {
      add(index, { id: 123, tags: ["foo", "bar"], isBlinky: false });
      add(index, { id: 321, isBlinky: true });
    }).not.toThrowError();

    expect(tokenize).toHaveBeenCalledWith("123", "id");
    expect(tokenize).toHaveBeenCalledWith("foo,bar", "tags");
    expect(tokenize).toHaveBeenCalledWith("false", "isBlinky");

    expect(tokenize).toHaveBeenCalledWith("321", "id");
    expect(tokenize).toHaveBeenCalledWith("true", "isBlinky");
  });

  it("passes document and field name to the field extractor", () => {
    const extractField = vi.fn((document: any, fieldName: string) => {
      if (fieldName === "pubDate")
        return (
          document[fieldName] && document[fieldName].toLocaleDateString("it-IT")
        );

      return fieldName
        .split(".")
        .reduce((doc, key) => doc && doc[key], document);
    });
    const tokenize = vi.fn((string) => string.split(/\W+/));
    const index = createIndex({
      fields: ["title", "pubDate", "author.name"],
      storeFields: ["category"],
      extractField,
      tokenize,
    });
    const document = {
      id: 1,
      title: "Divina Commedia",
      pubDate: new Date(1320, 0, 1),
      author: { name: "Dante Alighieri" },
      category: "poetry",
    };

    add(index, document);
    expect(extractField).toHaveBeenCalledWith(document, "title");
    expect(extractField).toHaveBeenCalledWith(document, "pubDate");
    expect(extractField).toHaveBeenCalledWith(document, "author.name");
    expect(extractField).toHaveBeenCalledWith(document, "category");
    expect(tokenize).toHaveBeenCalledWith(document.title, "title");
    expect(tokenize).toHaveBeenCalledWith("1/1/1320", "pubDate");
    expect(tokenize).toHaveBeenCalledWith(document.author.name, "author.name");
    expect(tokenize).not.toHaveBeenCalledWith(document.category, "category");
  });

  it("passes field value and name to tokenizer", () => {
    const tokenize = vi.fn((string) => string.split(/\W+/));
    const index = createIndex({ fields: ["text", "title"], tokenize });
    const document = {
      id: 1,
      title: "Divina Commedia",
      text: "Nel mezzo del cammin di nostra vita",
    };

    add(index, document);
    expect(tokenize).toHaveBeenCalledWith(document.text, "text");
    expect(tokenize).toHaveBeenCalledWith(document.title, "title");
  });

  it("passes field value and name to term processor", () => {
    const processTerm = vi.fn((term) => term.toLowerCase());
    const index = createIndex({ fields: ["text", "title"], processTerm });
    const document = {
      id: 1,
      title: "Divina Commedia",
      text: "Nel mezzo del cammin di nostra vita",
    };

    add(index, document);
    document.text.split(/\W+/).forEach((term) => {
      expect(processTerm).toHaveBeenCalledWith(term, "text");
    });
    document.title.split(/\W+/).forEach((term) => {
      expect(processTerm).toHaveBeenCalledWith(term, "title");
    });
  });

  it("allows processTerm to expand a single term into several terms", () => {
    const processTerm = (term: string) =>
      term === "foobar" ? ["foo", "bar"] : term;
    const index = createIndex({ fields: ["title", "text"], processTerm });

    expect(() => {
      add(index, { id: 123, text: "foobar" });
    }).not.toThrowError();

    expect(search(index, "bar")).toHaveLength(1);
  });
});
