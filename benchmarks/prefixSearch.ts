import { Suite } from "benchmark";

import { _index } from "./divinaCommedia.js";

const suite = new Suite("Prefix search");

suite
  .add('Array.from(SearchableMap#atPrefix("vir"))', () => {
    _index.atPrefix("vir");
  })
  .add('Array.from(SearchableMap#atPrefix("virtut"))', () => {
    _index.atPrefix("virtut");
  });

export default suite;
