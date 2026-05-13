import { describe, expect, it, vi } from "vitest";

import {
  assignUniqueTerm,
  assignUniqueTerms,
  objectToNumericMapAsync,
  termToQuerySpec,
  wait,
} from "../src/utils.js";

describe(wait, () => {
  it("resolves after the given time", async () => {
    vi.useFakeTimers();
    let resolved = false;
    const promise = wait(100).then(() => void (resolved = true));

    expect(resolved).toBe(false);

    vi.runAllTimers();
    await promise;
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });
});

describe(assignUniqueTerm, () => {
  it("adds unique terms", () => {
    const target: string[] = ["foo"];

    assignUniqueTerm(target, "bar");
    expect(target).toStrictEqual(["foo", "bar"]);
  });

  it("skips duplicate terms", () => {
    const target = ["foo", "bar"];

    assignUniqueTerm(target, "foo");
    expect(target).toStrictEqual(["foo", "bar"]);
  });
});

describe(assignUniqueTerms, () => {
  it("adds unique terms from a source array", () => {
    const target: string[] = ["foo"];

    assignUniqueTerms(target, ["bar", "baz"]);
    expect(target).toStrictEqual(["foo", "bar", "baz"]);
  });

  it("skips duplicate terms from a source array", () => {
    const target = ["foo", "bar"];

    assignUniqueTerms(target, ["bar", "baz"]);
    expect(target).toStrictEqual(["foo", "bar", "baz"]);
  });
});

describe(termToQuerySpec, () => {
  it("uses defaults when options are empty", () => {
    const fn = termToQuerySpec({});
    const result = fn("test", 0, ["test"]);

    expect(result).toStrictEqual({
      term: "test",
      fuzzy: false,
      prefix: false,
      termBoost: 1,
    });
  });

  it("uses function-based fuzzy and prefix", () => {
    const fn = termToQuerySpec({
      fuzzy: () => 2,
      prefix: (term: string) => term.length > 3,
    });
    const result = fn("test", 0, ["test"]);

    expect(result).toStrictEqual({
      term: "test",
      fuzzy: 2,
      prefix: true,
      termBoost: 1,
    });
  });

  it("uses function-based boostTerm", () => {
    const fn = termToQuerySpec({
      boostTerm: (_term: string, index: number) => index + 1,
    });
    const result = fn("test", 0, ["test"]);

    expect(result).toStrictEqual({
      term: "test",
      fuzzy: false,
      prefix: false,
      termBoost: 1,
    });
  });
});

describe(objectToNumericMapAsync, () => {
  it("converts an object to a numeric map", async () => {
    const map = await objectToNumericMapAsync({ "1": "a", "2": "b" });

    expect(map).toStrictEqual(
      new Map([
        [1, "a"],
        [2, "b"],
      ]),
    );
  });

  it("pauses every 1000 entries", async () => {
    const largeObj: Record<string, number> = {};

    for (let i = 0; i < 1001; i++) largeObj[String(i)] = i;

    const map = await objectToNumericMapAsync(largeObj);

    expect(map.size).toBe(1001);
    for (let i = 0; i < 1001; i++) expect(map.get(i)).toBe(i);
  });
});
