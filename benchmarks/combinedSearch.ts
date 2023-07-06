import Benchmark from "benchmark";

import { index, search } from "./divinaCommedia.js";

const suite = new Benchmark.Suite("Combined search");

suite
  .add(
    'SlimSearch#search("virtute conoscienza", { fuzzy: 0.2, prefix: true })',
    () => {
      search(index, "virtute conoscienza", {
        fuzzy: 0.2,
        prefix: true,
      });
    },
  )
  .add('SlimSearch#search("virtu", { fuzzy: 0.2, prefix: true })', () => {
    search(index, "virtu", {
      fuzzy: 0.2,
      prefix: true,
    });
  });

export default suite;
