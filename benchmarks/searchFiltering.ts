import { Suite } from "benchmark";

import { index, search } from "./divinaCommedia.js";

const suite = new Suite("Search filtering");

suite.add('SlimSearch#search("virtu", { filter: ... })', () => {
  search(index, "virtu", {
    prefix: true,
    filter: ({ id }: { id: string }) => id.startsWith("Inf"),
  });
});

export default suite;
