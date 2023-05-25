import Benchmark from "benchmark";

import { index, search } from "./divinaCommedia.js";

const suite = new Benchmark.Suite("Search filtering");

suite.add('MiniSearch#search("virtu", { filter: ... })', () => {
  search(index, "virtu", {
    prefix: true,
    filter: ({ id }: { id: string }) => id.startsWith("Inf"),
  });
});

export default suite;
