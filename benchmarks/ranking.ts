import Benchmark from "benchmark";

import { index, search } from "./divinaCommedia.js";

const suite = new Benchmark.Suite("Ranking search results");

suite.add('SlimSearch#search("vi", { prefix: true })', () => {
  search(index, "vi", { prefix: true });
});

export default suite;
