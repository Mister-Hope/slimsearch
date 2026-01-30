import { LEAF } from "./TreeIterator.js";
import type { FuzzyResults, RadixTree } from "./typings.js";

// oxlint-disable-next-line typescript/no-explicit-any
export const fuzzySearch = <Value = any>(
  node: RadixTree<Value>,
  query: string,
  maxDistance: number,
): FuzzyResults<Value> => {
  const results: FuzzyResults<Value> = new Map();

  if (typeof query !== "string") return results;

  // Number of columns in the Levenshtein matrix.
  const numCols = query.length + 1;

  // Matching terms can never be longer than numCols + maxDistance.
  const numRows = numCols + maxDistance;

  // Fill first matrix row and column with numbers: 0 1 2 3 ...
  const matrix = new Uint8Array(numRows * numCols).fill(maxDistance + 1);

  for (let j = 0; j < numCols; ++j) matrix[j] = j;
  for (let i = 1; i < numRows; ++i) matrix[i * numCols] = i;

  recurse(node, query, maxDistance, results, matrix, 1, numCols, "");

  return results;
};

// Modified version of http://stevehanov.ca/blog/?id=114

// This builds a Levenshtein matrix for a given query and continuously updates
// it for nodes in the radix tree that fall within the given maximum edit
// distance. Keeping the same matrix around is beneficial especially for larger
// edit distances.
//
//           k   a   t   e   <-- query
//       0   1   2   3   4
//   c   1   1   2   3   4
//   a   2   2   1   2   3
//   t   3   3   2   1  [2]  <-- edit distance
//   ^
//   ^ term in radix tree, rows are added and removed as needed

// oxlint-disable-next-line max-params, typescript/no-explicit-any
const recurse = <Value = any>(
  node: RadixTree<Value>,
  query: string,
  maxDistance: number,
  results: FuzzyResults<Value>,
  matrix: Uint8Array,
  rowIndex: number,
  numCols: number,
  prefix: string,
): void => {
  const offset = rowIndex * numCols;

  // oxlint-disable-next-line no-labels
  key: for (const key of node.keys())
    if (key === LEAF) {
      // We've reached a leaf node. Check if the edit distance acceptable and
      // store the result if it is.
      const distance = matrix[offset - 1];

      if (distance <= maxDistance)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        results.set(prefix, [node.get(key)!, distance]);
    } else {
      // Iterate over all characters in the key. Update the Levenshtein matrix
      // and check if the minimum distance in the last row is still within the
      // maximum edit distance. If it is, we can recurse over all child nodes.
      let i = rowIndex;

      for (let pos = 0; pos < key.length; ++pos, ++i) {
        const char = key[pos];
        const thisRowOffset = numCols * i;
        const prevRowOffset = thisRowOffset - numCols;

        // Set the first column based on the previous row, and initialize the
        // minimum distance in the current row.
        let minDistance = matrix[thisRowOffset];

        const jmin = Math.max(0, i - maxDistance - 1);
        const jmax = Math.min(numCols - 1, i + maxDistance);

        // Iterate over remaining columns (characters in the query).
        for (let j = jmin; j < jmax; ++j) {
          const different = char !== query[j];

          // It might make sense to only read the matrix positions used for
          // deletion/insertion if the characters are different. But we want to
          // avoid conditional reads for performance reasons.
          const rpl = matrix[prevRowOffset + j] + Number(different);
          const del = matrix[prevRowOffset + j + 1] + 1;
          const ins = matrix[thisRowOffset + j] + 1;

          const dist = (matrix[thisRowOffset + j + 1] = Math.min(rpl, del, ins));

          if (dist < minDistance) minDistance = dist;
        }

        // Because distance will never decrease, we can stop. There will be no
        // matching child nodes.
        // oxlint-disable-next-line no-labels
        if (minDistance > maxDistance) continue key;
      }

      recurse(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        node.get(key)!,
        query,
        maxDistance,
        results,
        matrix,
        i,
        numCols,
        prefix + key,
      );
    }
};
