import { bench, describe } from "vitest";

import { index, loadJSONIndex } from "./__fixtures__/store.js";

const json = JSON.stringify(index);

describe("Load index", () => {
  bench("loadJSONIndex(json, options)", () => {
    loadJSONIndex(json, { fields: ["txt"] });
  });
});
