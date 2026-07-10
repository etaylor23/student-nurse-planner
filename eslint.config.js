import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // `.claude` holds tooling + git worktrees (which nest a full source copy under
  // .claude/worktrees/*); never lint those — they break `eslint .` run from the repo root.
  // `infra` is a separate CDK project with its own toolchain; the *.generated.ts zod
  // schemas are a codegen artefact (validated by ts-to-zod, not hand-written).
  { ignores: ["dist", "node_modules", ".claude", "infra", "src/**/*.generated.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Allow intentionally-unused `_`-prefixed args (interface methods that ignore a
    // parameter — e.g. the server owning userId — and documented Phase-2 stubs).
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["tests/**/*.ts", "*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },
  // Keep formatting concerns to Prettier; disable conflicting ESLint rules.
  prettier,
);
