import { bench } from "vitest";

import { index, loadJSONIndex } from "./__fixtures__/store.js";

const json = JSON.stringify(index);

bench("loadJSONIndex(json, options)", () => {
  loadJSONIndex(json, { fields: ["txt"] });
});
