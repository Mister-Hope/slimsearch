import { Suite } from "benchmark";

import { index, search } from "./divinaCommedia.js";

const suite = new Suite("Ranking search results");

suite.add('SlimSearch#search("vi", { prefix: true })', () => {
  search(index, "vi", { prefix: true });
});

export default suite;
