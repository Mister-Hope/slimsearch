import Benchmark from "benchmark";

import { autoSuggest, index } from "./divinaCommedia.js";

const suite = new Benchmark.Suite("Auto suggestion");

suite
  .add('MiniSearch#autoSuggest("virtute cano")', () => {
    autoSuggest(index, "virtute cano");
  })
  .add('MiniSearch#autoSuggest("virtue conoscienza", { fuzzy: 0.2 })', () => {
    autoSuggest(index, "virtue conoscienza");
  });

export default suite;
