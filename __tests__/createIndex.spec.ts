import { describe, expect, it } from "vitest";

import { createIndex } from "../src/index.js";

describe("createIndex()", () => {
  it("throws error if fields option is missing", () => {
    // @ts-expect-error
    expect(() => createIndex()).toThrow(
      'SlimSearch: option "fields" must be provided'
    );
  });

  it("initializes the attributes", () => {
    const options = { fields: ["title", "text"] };
    const index = createIndex(options);

    expect(index._documentCount).toEqual(0);
    expect(index._fieldIds).toEqual({ title: 0, text: 1 });
    expect(index._documentIds.size).toEqual(0);
    expect(index._fieldLength.size).toEqual(0);
    expect(index._avgFieldLength.length).toEqual(0);
    expect(index._options).toMatchObject(options);
  });
});
