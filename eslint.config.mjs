import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", ".hermes/**", "apps/web/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { process: "readonly", console: "readonly", Buffer: "readonly", fetch: "readonly", URL: "readonly", AbortController: "readonly", setTimeout: "readonly", clearTimeout: "readonly" } } },
);
