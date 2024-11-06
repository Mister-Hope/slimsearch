import { Suite } from "benchmark";

import { index, loadJSONIndex } from "./divinaCommedia.js";

const json = JSON.stringify(index);

const suite = new Suite("Load index");

suite.add("SlimSearch.loadJSON(json, options)", () => {
  loadJSONIndex(json, { fields: ["txt"] });
});

export default suite;
