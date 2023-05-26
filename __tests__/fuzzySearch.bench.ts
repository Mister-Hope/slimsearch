import { bench, describe } from "vitest";

import { _index } from "./__fixtures__/store.js";

describe("Fuzzy search", () => {
  bench('fuzzyGet("virtute", 1)', () => {
    _index.fuzzyGet("virtute", 1);
  });
  bench('fuzzyGet("virtu", 2)', () => {
    _index.fuzzyGet("virtu", 2);
  });
  bench('fuzzyGet("virtu", 3)', () => {
    _index.fuzzyGet("virtu", 3);
  });
  bench('fuzzyGet("virtute", 4)', () => {
    _index.fuzzyGet("virtute", 4);
  });
});
