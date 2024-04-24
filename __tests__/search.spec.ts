import { describe, expect, it, vi } from "vitest";

import type { SearchResult } from "../src/index.js";
import {
  WILDCARD,
  add,
  addAll,
  createIndex,
  getDefaultValue,
  search,
} from "../src/index.js";

describe("search()", () => {
  interface Document {
    id: number;
    title: string;
    text: string;
    lang?: string;
    category?: string;
  }

  const documents: Document[] = [
    {
      id: 1,
      title: "Divina Commedia",
      text: "Nel mezzo del cammin di nostra vita",
    },
    {
      id: 2,
      title: "I Promessi Sposi",
      text: "Quel ramo del lago di Como",
      lang: "it",
      category: "fiction",
    },
    {
      id: 3,
      title: "Vita Nova",
      text: "In quella parte del libro della mia memoria",
      category: "poetry",
    },
  ];
  const index = createIndex<
    number,
    Document,
    { lang?: string; category?: string }
  >({
    fields: ["title", "text"],
    storeFields: ["lang", "category"],
  });

  addAll(index, documents);

  it("returns scored results", () => {
    const results = search(index, "vita");

    expect(results.length).toBeGreaterThan(0);
    expect(results.map(({ id }) => id).sort()).toEqual([1, 3]);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("returns stored fields in the results", () => {
    const results = search(index, "del");

    expect(results.length).toBeGreaterThan(0);
    expect(results.map(({ lang }) => lang).sort()).toEqual([
      "it",
      undefined,
      undefined,
    ]);
    expect(results.map(({ category }) => category).sort()).toEqual([
      "fiction",
      "poetry",
      undefined,
    ]);
  });

  it("returns empty array if there is no match", () => {
    const results = search(index, "paguro");

    expect(results).toEqual([]);
  });

  it("returns empty array for empty search", () => {
    const results = search(index, "");

    expect(results).toEqual([]);
  });

  it("returns empty results for terms that are not in the index", () => {
    let results: SearchResult[] | null = null;

    expect(() => {
      results = search(index, "sottomarino aeroplano");
    }).not.toThrowError();
    expect(results!.length).toEqual(0);
  });

  it("boosts fields", () => {
    const results = search(index, "vita", { boost: { title: 2 } });

    expect(results.map(({ id }) => id)).toEqual([3, 1]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("computes a meaningful score when fields are named liked default properties of object", () => {
    const index = createIndex<number, { id: number; constructor: string }>({
      fields: ["constructor"],
    });

    add(index, { id: 1, constructor: "something" });
    add(index, { id: 2, constructor: "something else" });

    const results = search(index, "something");

    results.forEach((result) => {
      expect(Number.isFinite(result.score)).toBe(true);
    });
  });

  it("searches only selected fields", () => {
    const results = search(index, "vita", { fields: ["title"] });

    expect(results).toHaveLength(1);
    expect(results[0].id).toEqual(3);
  });

  it("searches only selected fields even if other fields are boosted", () => {
    const results = search(index, "vita", {
      fields: ["title"],
      boost: { text: 2 },
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toEqual(3);
  });

  it("combines results with OR by default", () => {
    const results = search(index, "cammin como sottomarino");

    expect(results.length).toEqual(2);
    expect(results.map(({ id }) => id)).toEqual([2, 1]);
  });

  it("combines results with AND if combineWith is AND", () => {
    const results = search(index, "vita cammin", { combineWith: "AND" });

    expect(results.length).toEqual(1);
    expect(results.map(({ id }) => id)).toEqual([1]);
    expect(
      search(index, "vita sottomarino", { combineWith: "AND" }).length,
    ).toEqual(0);
    expect(
      search(index, "sottomarino vita", { combineWith: "AND" }).length,
    ).toEqual(0);
  });

  it("combines results with AND_NOT if combineWith is AND_NOT", () => {
    const results = search(index, "vita cammin", { combineWith: "AND_NOT" });

    expect(results.length).toEqual(1);
    expect(results.map(({ id }) => id)).toEqual([3]);
    expect(
      search(index, "vita sottomarino", { combineWith: "AND_NOT" }).length,
    ).toEqual(2);
    expect(
      search(index, "sottomarino vita", { combineWith: "AND_NOT" }).length,
    ).toEqual(0);
  });

  it("raises an error if combineWith is not a valid operator", () => {
    expect(() => {
      // @ts-expect-error: error checking
      search(index, "vita cammin", { combineWith: "XOR" });
    }).toThrowError("Invalid combination operator: XOR");
  });

  it("returns empty results for empty search", () => {
    expect(search(index, "")).toEqual([]);
    expect(search(index, "", { combineWith: "OR" })).toEqual([]);
    expect(search(index, "", { combineWith: "AND" })).toEqual([]);
    expect(search(index, "", { combineWith: "AND_NOT" })).toEqual([]);
  });

  it("executes fuzzy search", () => {
    const results = search(index, "camin memory", { fuzzy: 2 });

    expect(results.length).toEqual(2);
    expect(results.map(({ id }) => id)).toEqual([1, 3]);
  });

  it("executes fuzzy search with maximum fuzziness", () => {
    const results = search(index, "comedia", { fuzzy: 0.6, maxFuzzy: 3 });

    expect(results.length).toEqual(1);
    expect(results.map(({ id }) => id)).toEqual([1]);
  });

  it("executes prefix search", () => {
    const results = search(index, "que", { prefix: true });

    expect(results.length).toEqual(2);
    expect(results.map(({ id }) => id)).toEqual([2, 3]);
  });

  it("combines prefix search and fuzzy search", () => {
    const results = search(index, "cammino quel", {
      fuzzy: 0.25,
      prefix: true,
    });

    expect(results.length).toEqual(3);
    expect(results.map(({ id }) => id)).toEqual([2, 1, 3]);
  });

  it("assigns weights to prefix matches and fuzzy matches", () => {
    const exact = search(index, "cammino quel");

    expect(exact.map(({ id }) => id)).toEqual([2]);

    const prefixLast = search(index, "cammino quel", {
      fuzzy: true,
      prefix: true,
      weights: { prefix: 0.1 },
    });

    expect(prefixLast.map(({ id }) => id)).toEqual([2, 1, 3]);
    expect(prefixLast[0].score).toEqual(exact[0].score);

    const fuzzyLast = search(index, "cammino quel", {
      fuzzy: true,
      prefix: true,
      weights: { fuzzy: 0.1 },
    });

    expect(fuzzyLast.map(({ id }) => id)).toEqual([2, 3, 1]);
    expect(fuzzyLast[0].score).toEqual(exact[0].score);
  });

  it("assigns weight lower than exact match to a match that is both a prefix and fuzzy match", () => {
    interface Document {
      id: number;
      text: string;
    }
    const index = createIndex<number, Document>({ fields: ["text"] });
    const documents: Document[] = [
      { id: 1, text: "Poi che la gente poverella crebbe" },
      { id: 2, text: "Deus, venerunt gentes" },
    ];

    addAll(index, documents);
    expect(index.documentCount).toEqual(documents.length);

    const exact = search(index, "gente");
    const combined = search(index, "gente", { fuzzy: 0.2, prefix: true });

    expect(combined.map(({ id }) => id)).toEqual([1, 2]);
    expect(combined[0].score).toEqual(exact[0].score);
    expect(combined[1].match.gentes).toEqual(["text"]);
  });

  it("accepts a function to compute fuzzy and prefix options from term", () => {
    const fuzzy = vi.fn((term: string) => (term.length > 4 ? 2 : false));
    const prefix = vi.fn((term: string) => term.length > 4);
    const results = search(index, "quel comedia", { fuzzy, prefix });

    expect(fuzzy).toHaveBeenNthCalledWith(1, "quel", 0, ["quel", "comedia"]);
    expect(fuzzy).toHaveBeenNthCalledWith(2, "comedia", 1, ["quel", "comedia"]);
    expect(prefix).toHaveBeenNthCalledWith(1, "quel", 0, ["quel", "comedia"]);
    expect(prefix).toHaveBeenNthCalledWith(2, "comedia", 1, [
      "quel",
      "comedia",
    ]);
    expect(results.length).toEqual(2);
    expect(results.map(({ id }) => id)).toEqual([2, 1]);
  });

  it("boosts documents by calling boostDocument with document ID, term, and stored fields", () => {
    const query = "divina commedia nova";
    const boostFactor = 1.234;
    const boostDocument = vi.fn(() => boostFactor);
    const resultsWithoutBoost = search(index, query);
    const results = search(index, query, { boostDocument });

    expect(boostDocument).toHaveBeenCalledWith(1, "divina", {});
    expect(boostDocument).toHaveBeenCalledWith(1, "commedia", {});
    expect(boostDocument).toHaveBeenCalledWith(3, "nova", {
      category: "poetry",
    });
    expect(results[0].score).toBeCloseTo(
      resultsWithoutBoost[0].score * boostFactor,
    );
  });

  it("skips document if boostDocument returns a falsy value", () => {
    const query = "vita";
    const boostDocument = vi.fn((id: any) => (id === 3 ? null : 1));
    const resultsWithoutBoost = search(index, query);
    // @ts-expect-error: boostDocument type issue
    const results = search(index, query, { boostDocument });

    expect(resultsWithoutBoost.map(({ id }) => id)).toContain(3);
    expect(results.map(({ id }) => id)).not.toContain(3);
  });

  it("uses a specific search-time tokenizer if specified", () => {
    const tokenize = (token: string): string[] => token.split("X");
    const results = search(index, "divinaXcommedia", { tokenize });

    expect(results.length).toBeGreaterThan(0);
    expect(results.map(({ id }) => id).sort()).toEqual([1]);
  });

  it("uses a specific search-time term processing function if specified", () => {
    const processTerm = (term: string): string =>
      term.replace(/1/g, "i").replace(/4/g, "a").toLowerCase();
    const results = search(index, "d1v1n4", { processTerm });

    expect(results.length).toBeGreaterThan(0);
    expect(results.map(({ id }) => id).sort()).toEqual([1]);
  });

  it("rejects falsy terms", () => {
    const processTerm = (term: string): string | null =>
      term === "quel" ? null : term;
    const results = search(index, "quel commedia", { processTerm });

    expect(results.length).toBeGreaterThan(0);
    expect(results.map(({ id }) => id).sort()).toEqual([1]);
  });

  it("allows processTerm to expand a single term into several terms", () => {
    const processTerm = (term: string): string[] | string =>
      term === "divinacommedia" ? ["divina", "commedia"] : term;
    const results = search(index, "divinacommedia", { processTerm });

    expect(results.length).toBeGreaterThan(0);
    expect(results.map(({ id }) => id).sort()).toEqual([1]);
  });

  it("allows custom filtering of results on the basis of stored fields", () => {
    const results = search(index, "del", {
      filter: ({ category }) => category === "poetry",
    });

    expect(results.length).toBe(1);
    expect(results.every(({ category }) => category === "poetry")).toBe(true);
  });

  it("allows customizing BM25+ parameters", () => {
    interface Document {
      id: number;
      text: string;
    }
    const index = createIndex<number, Document>({
      fields: ["text"],
      searchOptions: { bm25: { k: 1.2, b: 0.7, d: 0.5 } },
    });
    const documents = [
      { id: 1, text: "something very very very cool" },
      { id: 2, text: "something cool" },
    ];

    addAll(index, documents);

    expect(search(index, "very")[0].score).toBeGreaterThan(
      search(index, "very", { bm25: { k: 1, b: 0.7, d: 0.5 } })[0].score,
    );
    expect(search(index, "something")[1].score).toBeGreaterThan(
      search(index, "something", { bm25: { k: 1.2, b: 1, d: 0.5 } })[1].score,
    );
    expect(search(index, "something")[1].score).toBeGreaterThan(
      search(index, "something", { bm25: { k: 1.2, b: 0.7, d: 0.1 } })[1].score,
    );

    // Defaults are taken from the searchOptions passed to the constructor
    const other = createIndex<number, Document>({
      fields: ["text"],
      searchOptions: { bm25: { k: 1, b: 0.7, d: 0.5 } },
    });

    addAll(other, documents);

    expect(search(other, "very")).toEqual(
      search(index, "very", { bm25: { k: 1, b: 0.7, d: 0.5 } }),
    );
  });

  it("allows searching for the special value `WILDCARD` to match all terms", () => {
    interface Document {
      id: number;
      text: string | null;
      cool: boolean;
    }
    const index = createIndex<number, Document, { cool: boolean }>({
      fields: ["text"],
      storeFields: ["cool"],
    });
    const documents = [
      { id: 1, text: "something cool", cool: true },
      { id: 2, text: "something else", cool: false },
      { id: 3, text: null, cool: true },
    ];

    addAll(index, documents);

    // The string "*" is just a normal term
    expect(search(index, "*")).toEqual([]);

    // The empty string is just a normal query
    expect(search(index, "")).toEqual([]);

    // The value `WILDCARD` matches all terms
    expect(search(index, WILDCARD).map(({ id }) => id)).toEqual([1, 2, 3]);

    // Filters and document boosting are still applied
    const results = search(index, WILDCARD, {
      filter: (x) => x.cool,
      boostDocument: (id) => id,
    });

    expect(results.map(({ id }) => id)).toEqual([3, 1]);
  });

  describe("when passing a query tree", () => {
    it("searches according to the given combination", () => {
      const results = search(index, {
        combineWith: "OR",
        queries: [
          {
            combineWith: "AND",
            queries: ["vita", "cammin"],
          },
          "como sottomarino",
          {
            combineWith: "AND",
            queries: ["nova", "pappagallo"],
          },
        ],
      });

      expect(results.length).toEqual(2);
      expect(results.map(({ id }) => id)).toEqual([1, 2]);
    });

    it("allows combining wildcard queries", () => {
      const results = search(index, {
        combineWith: "AND_NOT",
        queries: [WILDCARD, "vita"],
      });

      expect(results.length).toEqual(1);
      expect(results.map(({ id }) => id)).toEqual([2]);
    });

    it("uses the given options for each subquery, cascading them properly", () => {
      const results = search(index, {
        combineWith: "OR",
        fuzzy: true,
        queries: [
          {
            prefix: true,
            fields: ["title"],
            queries: ["vit"],
          },
          {
            combineWith: "AND",
            queries: ["bago", "coomo"],
          },
        ],
        weights: {
          fuzzy: 0.2,
          prefix: 0.75,
        },
      });

      expect(results.length).toEqual(2);
      expect(results.map(({ id }) => id)).toEqual([3, 2]);
    });

    it("uses the search options in the second argument as default", () => {
      const reference = search(index, {
        queries: [
          { fields: ["text"], queries: ["vita"] },
          { fields: ["title"], queries: ["promessi"] },
        ],
      });

      // Boost field
      let results = search(
        index,
        {
          queries: [
            { fields: ["text"], queries: ["vita"] },
            { fields: ["title"], queries: ["promessi"] },
          ],
        },
        { boost: { title: 2 } },
      );

      expect(results.length).toEqual(reference.length);
      expect(results.find((r) => r.id === 2)!.score).toBeGreaterThan(
        reference.find((r) => r.id === 2)!.score,
      );

      // Combine with AND
      results = search(
        index,
        {
          queries: [
            { fields: ["text"], queries: ["vita"] },
            { fields: ["title"], queries: ["promessi"] },
          ],
        },
        { combineWith: "AND" },
      );

      expect(results.length).toEqual(0);

      // Combine with AND, then override it with OR
      results = search(
        index,
        {
          queries: [
            { fields: ["text"], queries: ["vita"] },
            { fields: ["title"], queries: ["promessi"] },
          ],
          combineWith: "OR",
        },
        { combineWith: "AND" },
      );

      expect(results.length).toEqual(reference.length);
    });
  });

  describe("match data", () => {
    interface Document {
      id: number;
      title: string;
      text: string;
    }
    const documents = [
      {
        id: 1,
        title: "Divina Commedia",
        text: "Nel mezzo del cammin di nostra vita",
      },
      {
        id: 2,
        title: "I Promessi Sposi",
        text: "Quel ramo del lago di Como",
      },
      {
        id: 3,
        title: "Vita Nova",
        text: "In quella parte del libro della mia memoria ... vita",
      },
    ];
    const index = createIndex<number, Document>({ fields: ["title", "text"] });

    addAll(index, documents);

    it("reports information about matched terms and fields", () => {
      const results = search(index, "vita nova");

      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ match }) => match)).toEqual([
        { vita: ["title", "text"], nova: ["title"] },
        { vita: ["text"] },
      ]);
      expect(results.map(({ terms }) => terms)).toEqual([
        ["vita", "nova"],
        ["vita"],
      ]);
    });

    it("reports correct info when combining terms with AND", () => {
      const results = search(index, "vita nova", { combineWith: "AND" });

      expect(results.map(({ match }) => match)).toEqual([
        { vita: ["title", "text"], nova: ["title"] },
      ]);
      expect(results.map(({ terms }) => terms)).toEqual([["vita", "nova"]]);
    });

    it("reports correct info for fuzzy and prefix queries", () => {
      const results = search(index, "vi nuova", { fuzzy: 0.2, prefix: true });

      expect(results.map(({ match }) => match)).toEqual([
        { vita: ["title", "text"], nova: ["title"] },
        { vita: ["text"] },
      ]);
      expect(results.map(({ terms }) => terms)).toEqual([
        ["vita", "nova"],
        ["vita"],
      ]);
    });

    it("reports correct info for many fuzzy and prefix queries", () => {
      const results = search(index, "vi nuova m de", {
        fuzzy: 0.2,
        prefix: true,
      });

      expect(results.map(({ match }) => match)).toEqual([
        {
          del: ["text"],
          della: ["text"],
          memoria: ["text"],
          mia: ["text"],
          vita: ["title", "text"],
          nova: ["title"],
        },
        { del: ["text"], mezzo: ["text"], vita: ["text"] },
        { del: ["text"] },
      ]);
      expect(results.map(({ terms }) => terms)).toEqual([
        ["vita", "nova", "memoria", "mia", "della", "del"],
        ["vita", "mezzo", "del"],
        ["del"],
      ]);
    });

    it("passes only the query to tokenize", () => {
      const tokenize = vi.fn((content: string) => content.split(/\W+/));
      const index = createIndex({
        fields: ["text", "title"],
        searchOptions: { tokenize },
      });
      const query = "some search query";

      search(index, query);
      expect(tokenize).toHaveBeenCalledWith(query);
    });

    it("passes only the term to processTerm", () => {
      const processTerm = vi.fn((term: string) => term.toLowerCase());
      const index = createIndex({
        fields: ["text", "title"],
        searchOptions: { processTerm },
      });
      const query = "some search query";

      search(index, query);
      query.split(/\W+/).forEach((term) => {
        expect(processTerm).toHaveBeenCalledWith(term);
      });
    });

    it("does not break when special properties of object are used as a term", () => {
      interface Document {
        id: number;
        text: string;
      }
      const specialWords = ["constructor", "hasOwnProperty", "isPrototypeOf"];
      const index = createIndex<number, Document>({ fields: ["text"] });
      const processTerm = getDefaultValue("processTerm") as (
        term: string,
      ) => string;

      add(index, { id: 1, text: specialWords.join(" ") });

      specialWords.forEach((word) => {
        expect(() => {
          search(index, word);
        }).not.toThrowError();

        const results = search(index, word);

        expect(results[0].id).toEqual(1);
        expect(results[0].match[processTerm(word)]).toEqual(["text"]);
      });
    });
  });

  describe("movie ranking set", () => {
    const index = createIndex<
      string,
      { id: string; title: string; description: string },
      { title: string }
    >({
      fields: ["title", "description"],
      storeFields: ["title"],
    });

    add(index, {
      id: "tt1487931",
      title: "Khumba",
      description:
        "When half-striped zebra Khumba is blamed for the lack of rain by the rest of his insular, superstitious herd, he embarks on a daring quest to earn his stripes. In his search for the legendary waterhole in which the first zebras got their stripes, Khumba meets a quirky range of characters and teams up with an unlikely duo: overprotective wildebeest Mama V and Bradley, a self-obsessed, flamboyant ostrich. But before he can reunite with his herd, Khumba must confront Phango, a sadistic leopard who controls the waterholes and terrorizes all the animals in the Great Karoo. It's not all black-and-white in this colorful adventure with a difference.",
    });

    add(index, {
      id: "tt8737608",
      title: "Rams",
      description: "A feud between two sheep farmers.",
    });

    add(index, {
      id: "tt0983983",
      title: "Shaun the Sheep",
      description:
        "Shaun is a cheeky and mischievous sheep at Mossy Bottom farm who's the leader of the flock and always plays slapstick jokes, pranks and causes trouble especially on Farmer X and his grumpy guide dog, Bitzer.",
    });

    add(index, {
      id: "tt5174284",
      title: "Shaun the Sheep: The Farmer's Llamas",
      description:
        "At the annual County Fair, three peculiar llamas catch the eye of Shaun, who tricks the unsuspecting Farmer into buying them. At first, it's all fun and games at Mossy Bottom Farm until the trio of unruly animals shows their true colours, wreaking havoc before everyone's eyes. Now, it's up to Bitzer and Shaun to come up with a winning strategy, if they want to reclaim the farm. Can they rid the once-peaceful ranch of the troublemakers?",
    });

    add(index, {
      id: "tt0102926",
      title: "The Silence of the Lambs",
      description:
        "F.B.I. trainee Clarice Starling (Jodie Foster) works hard to advance her career, while trying to hide or put behind her West Virginia roots, of which if some knew, would automatically classify her as being backward or white trash. After graduation, she aspires to work in the agency's Behavioral Science Unit under the leadership of Jack Crawford (Scott Glenn). While she is still a trainee, Crawford asks her to question Dr. Hannibal Lecter (Sir Anthony Hopkins), a psychiatrist imprisoned, thus far, for eight years in maximum security isolation for being a serial killer who cannibalized his victims. Clarice is able to figure out the assignment is to pick Lecter's brains to help them solve another serial murder case, that of someone coined by the media as \"Buffalo Bill\" (Ted Levine), who has so far killed five victims, all located in the eastern U.S., all young women, who are slightly overweight (especially around the hips), all who were drowned in natural bodies of water, and all who were stripped of large swaths of skin. She also figures that Crawford chose her, as a woman, to be able to trigger some emotional response from Lecter. After speaking to Lecter for the first time, she realizes that everything with him will be a psychological game, with her often having to read between the very cryptic lines he provides. She has to decide how much she will play along, as his request in return for talking to him is to expose herself emotionally to him. The case takes a more dire turn when a sixth victim is discovered, this one from who they are able to retrieve a key piece of evidence, if Lecter is being forthright as to its meaning. A potential seventh victim is high profile Catherine Martin (Brooke Smith), the daughter of Senator Ruth Martin (Diane Baker), which places greater scrutiny on the case as they search for a hopefully still alive Catherine. Who may factor into what happens is Dr. Frederick Chilton (Anthony Heald), the warden at the prison, an opportunist who sees the higher profile with Catherine, meaning a higher profile for himself if he can insert himself successfully into the proceedings.",
    });

    add(index, {
      id: "tt0395479",
      title: "Boundin'",
      description:
        "In the not too distant past, a lamb lives in the desert plateau just below the snow line. He is proud of how bright and shiny his coat of wool is, so much so that it makes him want to dance, which in turn makes all the other creatures around him also want to dance. His life changes when one spring day he is captured, his wool shorn, and thrown back out onto the plateau all naked and pink. But a bounding jackalope who wanders by makes the lamb look at life a little differently in seeing that there is always something exciting in life to bound about.",
    });

    add(index, {
      id: "tt9812474",
      title: "Lamb",
      description:
        "Haunted by the indelible mark of loss and silent grief, sad-eyed María and her taciturn husband, Ingvar, seek solace in back-breaking work and the demanding schedule at their sheep farm in the remote, harsh, wind-swept landscapes of mountainous Iceland. Then, with their relationship hanging on by a thread, something unexplainable happens, and just like that, happiness blesses the couple's grim household once more. Now, as a painful ending gives birth to a new beginning, Ingvar's troubled brother, Pétur, arrives at the farmhouse, threatening María and Ingvar's delicate, newfound bliss. But, nature's gifts demand sacrifice. How far are ecstatic María and Ingvar willing to go in the name of love?",
    });

    add(index, {
      id: "tt0306646",
      title: "Ringing Bell",
      description:
        "A baby lamb named Chirin is living an idyllic life on a farm with many other sheep. Chirin is very adventurous and tends to get lost, so he wears a bell around his neck so that his mother can always find him. His mother warns Chirin that he must never venture beyond the fence surrounding the farm, because a huge black wolf lives in the mountains and loves to eat sheep. Chirin is too young and naive to take the advice to heart, until one night the wolf enters the barn and is prepared to kill Chirin, but at the last moment the lamb's mother throws herself in the way and is killed instead. The wolf leaves, and Chirin is horrified to see his mother's body. Unable to understand why his mother was killed, he becomes very angry and swears that he will go into the mountains and kill the wolf.",
    });

    add(index, {
      id: "tt1212022",
      title: "The Lion of Judah",
      description:
        "Follow the adventures of a bold lamb (Judah) and his stable friends as they try to avoid the sacrificial alter the week preceding the crucifixion of Christ. It is a heart-warming account of the Easter story as seen through the eyes of a lovable pig (Horace), a faint-hearted horse (Monty), a pedantic rat (Slink), a rambling rooster (Drake), a motherly cow (Esmay) and a downtrodden donkey (Jack). This magnificent period piece with its epic sets is a roller coaster ride of emotions. Enveloped in humor, this quest follows the animals from the stable in Bethlehem to the great temple in Jerusalem and onto the hillside of Calvary as these unlikely heroes try to save their friend. The journey weaves seamlessly through the biblical accounts of Palm Sunday, Jesus turning the tables in the temple, Peter's denial and with a tense, heart-wrenching climax, depicts the crucifixion and resurrection with gentleness and breathtaking beauty. For Judah, the lamb with the heart of a lion, it is a story of courage and faith. For Jack, the disappointed donkey, it becomes a pivotal voyage of hope. For Horace, the, well the dirty pig, and Drake the ignorant rooster, it is an opportunity to do something inappropriate and get into trouble.",
    });

    it("returns best results for lamb", () => {
      // This should be fairly easy. We test that exact matches come before
      // prefix matches, and that hits in shorter fields (title) come before
      // hits in longer fields (description)
      const hits = search(index, "lamb", { fuzzy: 1, prefix: true });

      expect(hits.map(({ title }) => title)).toEqual([
        // Exact title match.
        "Lamb",

        // Contains term twice, shortest description.
        "Boundin'",

        // Contains term twice.
        "Ringing Bell",

        // Contains term twice, longest description.
        "The Lion of Judah",

        // Prefix match in title.
        "The Silence of the Lambs",
      ]);
    });

    it("returns best results for sheep", () => {
      // This tests more complex interaction between scoring. We want hits in
      // the title to be automatically considered most relevant, because they
      // are very short, and the search term occurs less frequently in the
      // title than it does in the description. One result, 'Rams', has a very
      // short description with an exact match, but it should never outrank
      // the result with an exact match in the title AND description.
      const hits = search(index, "sheep", { fuzzy: 1, prefix: true });

      expect(hits.map(({ title }) => title)).toEqual([
        // Has 'sheep' in title and once in a description of average length.
        "Shaun the Sheep",

        // Has 'sheep' just once, in a short description.
        "Rams",

        // Contains 'sheep' just once, in a long title.
        "Shaun the Sheep: The Farmer's Llamas",

        // Has most occurrences of 'sheep'.
        "Ringing Bell",

        // Contains 'sheep' just once, in a long description.
        "Lamb",
      ]);
    });

    it("returns best results for shaun", () => {
      // Two movies contain the query in the title. Pick the shorter title.
      expect(search(index, "shaun the sheep")[0].title).toEqual(
        "Shaun the Sheep",
      );
      expect(
        search(index, "shaun the sheep", { fuzzy: 1, prefix: true })[0].title,
      ).toEqual("Shaun the Sheep");
    });

    it("returns best results for chirin", () => {
      // The title contains neither 'sheep' nor the character name. Movies
      // that have 'sheep' or 'the' in the title should not outrank this.
      expect(search(index, "chirin the sheep")[0].title).toEqual(
        "Ringing Bell",
      );
      expect(
        search(index, "chirin the sheep", { fuzzy: 1, prefix: true })[0].title,
      ).toEqual("Ringing Bell");
    });

    it("returns best results for judah", () => {
      // Title contains the character's name, but the word 'sheep' never
      // occurs. Other movies that do contain 'sheep' should not outrank this.
      expect(search(index, "judah the sheep")[0].title).toEqual(
        "The Lion of Judah",
      );
      expect(
        search(index, "judah the sheep", { fuzzy: 1, prefix: true })[0].title,
      ).toEqual("The Lion of Judah");
    });

    it("returns best results for bounding", () => {
      // The expected hit has an exact match in the description and a fuzzy
      // match in the title, and both variations of the term are highly
      // specific. Does not contain 'sheep' at all! Because 'sheep' is a
      // slightly more common term in the dataset, that should not cause other
      // results to outrank this.
      expect(search(index, "bounding sheep", { fuzzy: 1 })[0].title).toEqual(
        "Boundin'",
      );
    });
  });

  describe("song ranking set", () => {
    interface Document {
      id: string;
      song: string;
      artist: string;
    }
    const index = createIndex<string, Document, { song: string }>({
      fields: ["song", "artist"],
      storeFields: ["song"],
    });

    add(index, {
      id: "1",
      song: "Killer Queen",
      artist: "Queen",
    });

    add(index, {
      id: "2",
      song: "The Witch Queen Of New Orleans",
      artist: "Redbone",
    });

    add(index, {
      id: "3",
      song: "Waterloo",
      artist: "Abba",
    });

    add(index, {
      id: "4",
      song: "Take A Chance On Me",
      artist: "Abba",
    });

    add(index, {
      id: "5",
      song: "Help",
      artist: "The Beatles",
    });

    add(index, {
      id: "6",
      song: "Yellow Submarine",
      artist: "The Beatles",
    });

    add(index, {
      id: "7",
      song: "Dancing Queen",
      artist: "Abba",
    });

    add(index, {
      id: "8",
      song: "Bohemian Rhapsody",
      artist: "Queen",
    });

    it("returns best results for witch queen", () => {
      const hits = search(index, "witch queen", { fuzzy: 1, prefix: true });

      expect(hits.map(({ song }) => song)).toEqual([
        // The only result that has both terms. This should not be outranked
        // by hits that match only one term.
        "The Witch Queen Of New Orleans",

        // Contains just one term, but matches both song and artist.
        "Killer Queen",

        // Match on artist only. Artist is an exact match for 'Queen'.
        "Bohemian Rhapsody",

        // Match on song only. Song is a worse match for 'Queen'.
        "Dancing Queen",
      ]);
    });

    it("returns best results for queen", () => {
      // The only match where both song and artist contain 'queen'.
      expect(
        search(index, "queen", { fuzzy: 1, prefix: true })[0].song,
      ).toEqual("Killer Queen");
    });
  });
});
