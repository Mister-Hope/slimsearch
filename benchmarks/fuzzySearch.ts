import Benchmark from "benchmark";

import { _index } from "./divinaCommedia.js";

const suite = new Benchmark.Suite("Fuzzy search");

suite
  .add('SearchableMap#fuzzyGet("virtute", 1)', () => {
    _index.fuzzyGet("virtute", 1);
  })
  .add('SearchableMap#fuzzyGet("virtu", 2)', () => {
    _index.fuzzyGet("virtu", 2);
  })
  .add('SearchableMap#fuzzyGet("virtu", 3)', () => {
    _index.fuzzyGet("virtu", 3);
  })
  .add('SearchableMap#fuzzyGet("virtute", 4)', () => {
    _index.fuzzyGet("virtute", 4);
  });

export default suite;
