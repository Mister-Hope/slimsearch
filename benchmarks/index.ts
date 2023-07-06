import autoSuggestion from "./autoSuggestion.js";
import combinedSearch from "./combinedSearch.js";
import { lines } from "./divinaCommedia.js";
import exactSearch from "./exactSearch.js";
import fuzzySearch from "./fuzzySearch.js";
import indexing from "./indexing.js";
import loadIndex from "./loadIndex.js";
import memory from "./memory.js";
import prefixSearch from "./prefixSearch.js";
import ranking from "./ranking.js";
import searchFiltering from "./searchFiltering.js";

const { terms, documents, memSize, serializedSize } = memory(lines);

console.log(
  `Index size: ${terms} terms, ${documents} documents, ~${memSize}MB in memory, ${serializedSize}MB serialized.\n`,
);
[
  fuzzySearch,
  prefixSearch,
  exactSearch,
  indexing,
  combinedSearch,
  ranking,
  searchFiltering,
  autoSuggestion,
  loadIndex,
].forEach((suite) => {
  suite
    .on("start", () => {
      console.log(`${suite.name!}:`);
      console.log("=".repeat(suite.name!.length + 1));
    })
    .on("cycle", ({ target: benchmark }) => {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.log(`  * ${benchmark}`);
    })
    .on("complete", () => {
      console.log("");
    })
    .run();
});
