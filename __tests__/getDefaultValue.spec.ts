import { describe, expect, it } from "vitest";

import { getDefaultValue } from "../src/index.js";

describe(getDefaultValue, () => {
  it("returns the default value of the given option", () => {
    expect(getDefaultValue("idField")).toBe("id");
    expect(getDefaultValue("extractField")).toBeInstanceOf(Function);
    expect(getDefaultValue("tokenize")).toBeInstanceOf(Function);
    expect(getDefaultValue("processTerm")).toBeInstanceOf(Function);
    expect(getDefaultValue("searchOptions")).toBeUndefined();
    expect(getDefaultValue("fields")).toBeUndefined();
  });

  it("throws an error if there is no option with the given name", () => {
    expect(() => {
      getDefaultValue("foo");
    }).toThrow('SlimSearch: unknown option "foo"');
  });
});
