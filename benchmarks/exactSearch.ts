import Benchmark from "benchmark";

import { _index } from "./divinaCommedia.js";

const suite = new Benchmark.Suite("Exact search");

suite.add('SearchableMap#get("virtute")', () => {
  _index.get("virtute");
});

export default suite;
