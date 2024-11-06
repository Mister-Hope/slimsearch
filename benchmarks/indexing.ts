import { Suite } from "benchmark";

import type { Index } from "./divinaCommedia.js";
import { addAll, createIndex, lines } from "./divinaCommedia.js";

const suite = new Suite("Indexing");

suite.add("SlimSearch#addAll(documents)", () => {
  const index = createIndex<number, Index>({ fields: ["txt"] });

  addAll(index, lines);
});

export default suite;
