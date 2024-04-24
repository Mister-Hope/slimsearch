import { bench, describe } from "vitest";

import type { Index } from "./__fixtures__/store.js";
import {
  add,
  addAll,
  addAllAsync,
  createIndex,
  lines,
} from "./__fixtures__/store.js";

describe("index", () => {
  bench("add(document)", () => {
    const index = createIndex<string, Index>({ fields: ["txt"] });

    lines.forEach((line) => {
      add(index, line);
    });
  });

  bench("addAll(documents)", () => {
    const index = createIndex<string, Index>({ fields: ["txt"] });

    addAll(index, lines);
  });

  bench("addAllAsync(documents)", async () => {
    const index = createIndex<string, Index>({ fields: ["txt"] });

    await addAllAsync(index, lines);
  });
});
