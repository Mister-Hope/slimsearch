import { bench, describe } from "vitest";

import { _index } from "./__fixtures__/store.js";

describe("Exact search", () => {
  bench('get("virtute")', () => {
    _index.get("virtute");
  });
});
