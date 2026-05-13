import { describe, expect, it } from "vitest";

import { createIndex } from "../src/index.js";

describe(createIndex, () => {
  it("throws error if fields option is missing", () => {
    // @ts-expect-error: without options
    expect(() => createIndex()).toThrow('SlimSearch: option "fields" must be provided');
  });

  it("initializes the attributes", () => {
    const options = { fields: ["title", "text"] };
    const index = createIndex(options);

    expect(index._documentCount).toBe(0);
    expect(index._fieldIds).toStrictEqual({ title: 0, text: 1 });
    expect(index._documentIds.size).toBe(0);
    expect(index._fieldLength.size).toBe(0);
    expect(index._avgFieldLength).toHaveLength(0);
    expect(index._options).toMatchObject(options);
  });
});
