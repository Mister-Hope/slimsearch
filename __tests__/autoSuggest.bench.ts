import { bench, describe } from "vitest";

import { autoSuggest, index } from "./__fixtures__/store.js";

describe(autoSuggest, () => {
  bench('autoSuggest("virtute cano")', () => {
    autoSuggest(index, "virtute cano");
  });
  bench('#autoSuggest("virtue conoscienza", { fuzzy: 0.2 })', () => {
    autoSuggest(index, "virtue conoscienza", { fuzzy: 0.2 });
  });
});
