// eslint-disable-next-line import-x/no-unresolved
import hopeConfig, { config, tsParser } from "eslint-config-mister-hope";

export default config(
  ...hopeConfig,

  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "docs/**"],
  },

  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
        parser: tsParser,
        tsconfigDirName: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
