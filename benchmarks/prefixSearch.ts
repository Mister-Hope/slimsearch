import Benchmark from "benchmark";

import { _index } from "./divinaCommedia.js";

const suite = new Benchmark.Suite("Prefix search");

suite
  .add('Array.from(SearchableMap#atPrefix("vir"))', () => {
    Array.from(_index.atPrefix("vir"));
  })
  .add('Array.from(SearchableMap#atPrefix("virtut"))', () => {
    Array.from(_index.atPrefix("virtut"));
  });

export default suite;
