import { hope } from "eslint-config-mister-hope";

export default hope({
  ignores: ["docs/**"],
  ts: {
    "@typescript-eslint/no-explicit-any": "off",
    "no-console": "off",
  },
});
