import { describe, expect, it } from "vitest";

import { addAll, createIndex, search } from "../src/index.js";

interface Document {
  id: number;
  text: string;
}

describe("default tokenization", () => {
  it("splits on non-alphanumeric taking diacritics into account", () => {
    const documents: Document[] = [
      {
        id: 1,
        text: `Se la vita è sventura,
perché da noi si dura?
Intatta luna, tale
è lo stato mortale.
Ma tu mortal non sei,
e forse del mio dir poco ti cale`,
      },
      {
        id: 2,
        text: 'The estimates range from roughly 1 in 100 to 1 in 100,000. The higher figures come from the working engineers, and the very low figures from management. What are the causes and consequences of this lack of agreement? Since 1 part in 100,000 would imply that one could put a Shuttle up each day for 300 years expecting to lose only one, we could properly ask "What is the cause of management\'s fantastic faith in the machinery?"',
      },
    ];
    const index = createIndex<Document, number>({ fields: ["text"] });

    addAll(index, documents);
    expect(search(index, "perché").length).toBeGreaterThan(0);
    expect(search(index, "perch").length).toEqual(0);
    expect(search(index, "luna").length).toBeGreaterThan(0);

    expect(search(index, "300").length).toBeGreaterThan(0);
    expect(search(index, "machinery").length).toBeGreaterThan(0);
  });

  it("supports non-latin alphabets", () => {
    const documents = [
      { id: 1, title: "София София" },
      { id: 2, title: "アネモネ" },
      { id: 3, title: "«τέχνη»" },
      { id: 4, title: "سمت  الرأس" },
      { id: 5, title: "123 45" },
    ];
    const index = createIndex<{ id: number; title: string }, number>({
      fields: ["title"],
    });

    addAll(index, documents);

    expect(search(index, "софия").map(({ id }) => id)).toEqual([1]);
    expect(search(index, "アネモネ").map(({ id }) => id)).toEqual([2]);
    expect(search(index, "τέχνη").map(({ id }) => id)).toEqual([3]);
    expect(search(index, "الرأس").map(({ id }) => id)).toEqual([4]);
    expect(search(index, "123").map(({ id }) => id)).toEqual([5]);
  });
});
