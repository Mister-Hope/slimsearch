import { bench } from "vitest";

import { _index } from "./__fixtures__/store.js";

bench('get("virtute")', () => {
  _index.get("virtute");
});
