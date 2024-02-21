import Benchmark from "benchmark";

import { type Index, addAll, createIndex, lines } from "./divinaCommedia.js";

const suite = new Benchmark.Suite("Indexing");

suite.add("SlimSearch#addAll(documents)", () => {
  const index = createIndex<number, Index>({ fields: ["txt"] });

  addAll(index, lines);
});

export default suite;
