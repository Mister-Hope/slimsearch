import type { SearchIndex } from "./divinaCommedia.js";
import { addAll, createIndex } from "./divinaCommedia.js";

const heapSize = (): number => {
  if (globalThis.gc) globalThis.gc();

  return process.memoryUsage().heapUsed;
};

const bytesToMb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(2);

const memory = (
  docs: unknown[],
): {
  terms: number;
  documents: number;
  memSize: string;
  serializedSize: string;
  index: SearchIndex;
} => {
  const index = createIndex({ fields: ["txt"], storeFields: ["txt"] });

  const heapBefore = heapSize();

  addAll(index, docs);

  const heapAfter = heapSize();

  const terms = index.termCount;
  const documents = index.documentCount;
  const memSize = bytesToMb(heapAfter - heapBefore);
  const serializedSize = bytesToMb(JSON.stringify(index).length);

  return { terms, documents, memSize, serializedSize, index };
};

export default memory;
