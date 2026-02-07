import { expect, it } from "vitest";

import { getDefaultValue } from "../src/index.js";

it("returns the default value of the given option", () => {
  expect(getDefaultValue("idField")).toEqual("id");
  expect(getDefaultValue("extractField")).toBeInstanceOf(Function);
  expect(getDefaultValue("tokenize")).toBeInstanceOf(Function);
  expect(getDefaultValue("processTerm")).toBeInstanceOf(Function);
  expect(getDefaultValue("searchOptions")).toBe(undefined);
  expect(getDefaultValue("fields")).toBe(undefined);
});

it("throws an error if there is no option with the given name", () => {
  expect(() => {
    getDefaultValue("foo");
  }).toThrowError('SlimSearch: unknown option "foo"');
});
