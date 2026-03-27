import { defaultIgnorePatterns, getOxlintConfigs } from "oxc-config-hope/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: getOxlintConfigs(),
  options: {
    typeAware: true,
    typeCheck: true,
  },
  ignorePatterns: [...defaultIgnorePatterns, "docs/"],
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
