import { bench, describe } from "vitest";

import {
  type Index,
  add,
  addAll,
  addAllAsync,
  createIndex,
  lines,
} from "./__fixtures__/store.js";

describe("index", () => {
  bench("add(document)", () => {
    const index = createIndex<Index>({ fields: ["txt"] });

    lines.forEach((line) => {
      add(index, line);
    });
  });

  bench("addAll(documents)", () => {
    const index = createIndex<Index>({ fields: ["txt"] });

    addAll(index, lines);
  });

  bench("addAllAsync(documents)", async () => {
    const index = createIndex<Index>({ fields: ["txt"] });

    await addAllAsync(index, lines);
  });
});
