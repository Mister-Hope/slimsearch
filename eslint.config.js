import { hope } from "eslint-config-mister-hope";

export default hope({
  ignores: ["docs/**"],
  ts: {
    parserOptions: {
      projectService: true,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
});
