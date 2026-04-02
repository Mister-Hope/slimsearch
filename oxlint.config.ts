import { defineHopeConfig } from "oxc-config-hope/oxlint";

export default defineHopeConfig({
  ignorePatterns: ["docs/"],
  rules: {
    "id-length": [
      "warn",
      {
        min: 2,
        exceptions: [
          // sorting
          "a",
          "b",
          // loops
          "i",
          "j",
          // type generics
          "T",
          // parameter name for unused variables
          "_",
          // bm25
          "k",
          "d",
        ],
      },
    ],
    "no-console": "off",
    "max-depth": ["warn", 5],
    "jsdoc/check-tag-names": ["warn", { definedTags: ["typeParam"] }],
  },
});
