import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  eslint.configs.recommended,
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      "react/display-name": "off",
      "react/self-closing-comp": [
        "error",
        {
          component: true,
          html: true,
        },
      ],
      "no-undef": "off",
      "no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "warn",
      "spaced-comment": "error",
      quotes: ["error", "double"],
      "no-duplicate-imports": "error",
      "no-fallthrough": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "no-constant-condition": [
        "error",
        {
          checkLoops: false,
        },
      ],
    },
  },
  // Library source: no `console.log` in shipping code. Use `debugLog` from
  // `cadjs/config` (no-op when `debug: false`) instead. `console.warn` /
  // `console.error` are still fine for actual error paths. Exception:
  // `config.ts` is the *implementation* of `debugLog` — it must call
  // `console.log` and gets opted out below.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/config.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='console'][callee.property.name='log']",
          message:
            "Use `debugLog` from cadjs/config; `console.log` is forbidden in shipping code.",
        },
      ],
    },
  },
  // Tests run with relaxed rules: `any` casts and underscore-prefixed
  // ignored-args are common, and CJS shims (`require`, `module.exports`) are
  // intentional. Architectural rules (no console.log) still apply elsewhere.
  {
    files: ["tests/**/*.{ts,tsx}", "tests/**/*.{js,cjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-restricted-syntax": "off",
    },
  },
  // Test fixtures and __mocks__ shims are CJS Node modules — declare the
  // node-cjs globals so lint stops flagging `module`, `require`, `process`.
  {
    files: ["tests/**/*.js", "tests/**/*.cjs"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },
  // OCC service / worker files speak to opencascade.js's `_NN` constructor
  // overloads. The facade (occ-facade.ts) wraps the high-frequency patterns
  // with typed helpers; everything else should go through it. `any` is
  // forbidden — the precise OCC type is always available. Long-tail one-off
  // OCC calls that don't warrant a helper can be silenced with
  // `// eslint-disable-next-line @typescript-eslint/no-explicit-any`.
  {
    files: ["src/services/occ-*.ts", "src/workers/occ-*.ts"],
    ignores: ["src/services/occ-facade.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  prettierRecommended,
];
