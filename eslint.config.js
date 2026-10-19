import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "node_modules/", "data/"] },
  js.configs.recommended,
  {
    files: ["src/assets/js/**/*.js", "src/lib/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["src/assets/js/lang-redirect.js"],
    languageOptions: { sourceType: "script" },
  },
  {
    files: ["*.mjs", "*.js", "scripts/**", "tests/**"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["tests/e2e/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
