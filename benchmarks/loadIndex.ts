import Benchmark from "benchmark";

import { index, loadJSONIndex } from "./divinaCommedia.js";

const json = JSON.stringify(index);

const suite = new Benchmark.Suite("Load index");

suite.add("MiniSearch.loadJSON(json, options)", () => {
  loadJSONIndex(json, { fields: ["txt"] });
});

export default suite;
