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
    type Document = { foo: string; text: string; title?: string };

    const index = createIndex<Document, string>({
      idField: "foo",
      fields: ["title", "text"],
    });

    expect(() => {
      // @ts-expect-error
      add(index, { text: "I do not have an ID" });
    }).toThrowError('SlimSearch: document does not have ID field "foo"');
  });

  it("throws error on duplicate ID", () => {
    type Document = { foo: string; text: string; title?: string };

    const index = createIndex<Document, string>({
      idField: "foo",
      fields: ["title", "text"],
    });

    add(index, { foo: "abc", text: "Something" });

    expect(() => {
      add(index, { foo: "abc", text: "I have a duplicate ID" });
    }).toThrowError("SlimSearch: duplicate ID abc");
  });

  it("extracts the ID field using extractField", () => {
    type Document = { id: { value: number }; text: string };

    const extractField = (
      document: Document,
      fieldName: string,
    ): string | number => {
      if (fieldName === "id") return document.id.value;

      return (<(document: any, fieldName: string) => string>(
        getDefaultValue("extractField")
      ))(document, fieldName);
    };
    const index = createIndex({
      fields: ["text"],
      // @ts-ignore
      extractField,
    });

    add(index, {
      id: { value: 123 },
      text: "Nel mezzo del cammin di nostra vita",
    });

    const results = search(index, "vita");

    expect(results[0].id).toEqual(123);
  });

  it("rejects falsy terms", () => {
    const processTerm = (term: string): string | null =>
      term === "foo" ? null : term;
    const index = createIndex<{ id: number; text: string }, number>({
      fields: ["title", "text"],
      processTerm,
    });

    expect(() => {
      add(index, { id: 123, text: "foo bar" });
    }).not.toThrowError();
  });

  it("turns the field to string before tokenization", () => {
    type Document = { id: number; tags?: string[]; isBlinky: boolean };

    const tokenize = vi.fn((x: string): string[] => x.split(/\W+/));
    const index = createIndex<Document, number>({
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
    type Document = {
      id: number;
      title: string;
      pubDate: Date;
      author: {
        name: string;
      };
      category: string;
    };
    const extractField = vi.fn(
      (document: Document, fieldName: string): string => {
        if (fieldName === "pubDate")
          return (
            document[fieldName] &&
            document[fieldName].toLocaleDateString("it-IT")
          );

        return fieldName.split(".").reduce(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          (doc, key) => doc && doc[key],
          document,
        ) as unknown as string;
      },
    );
    const tokenize = vi.fn((token: string): string[] => token.split(/\W+/));
    const index = createIndex<Document, number>({
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
    type Document = {
      id: number;
      title: string;
      text: string;
    };
    const tokenize = vi.fn((content: string): string[] => content.split(/\W+/));
    const index = createIndex<Document, number>({
      fields: ["text", "title"],
      tokenize,
    });
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
    type Document = {
      id: number;
      title: string;
      text: string;
    };
    const processTerm = vi.fn((term: string): string => term.toLowerCase());
    const index = createIndex<Document, number>({
      fields: ["text", "title"],
      processTerm,
    });
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
    const processTerm = (term: string): string[] | string =>
      term === "foobar" ? ["foo", "bar"] : term;
    const index = createIndex<{ id: number; text: string }, number>({
      fields: ["title", "text"],
      processTerm,
    });

    expect(() => {
      add(index, { id: 123, text: "foobar" });
    }).not.toThrowError();

    expect(search(index, "bar")).toHaveLength(1);
  });
});
