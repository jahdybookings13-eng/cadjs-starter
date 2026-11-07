import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  eslint.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "test-results/**",
      "playwright-report/**",
      "src/lib/*.mjs",
      // Generated/vendor assets staged by predev/prebuild (gitignored).
      "public/**",
      "vendor/**",
    ],
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
  // App source: no `console.log` in shipping code. `console.warn` /
  // `console.error` are still fine.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='console'][callee.property.name='log']",
          message:
            "Use `debugLog` from @vitekk02/cadjs; `console.log` is forbidden in shipping code.",
        },
      ],
    },
  },
  // E2E tests run with relaxed rules.
  {
    files: ["e2e/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-restricted-syntax": "off",
    },
  },
  // Fake-WebXR init script runs in the browser page context.
  {
    files: ["e2e/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        console: "readonly",
      },
    },
  },
  // Node scripts (headless probes) and Node-side .mjs helpers run outside the
  // browser bundle; they use process/Buffer and are not browser globals.
  {
    files: ["scripts/**/*.mjs", "src/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
    rules: { "no-undef": "off" },
  },
  prettierRecommended,
  { files: ["**/*.d.ts"], rules: { "spaced-comment": "off" } },
];
