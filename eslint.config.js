// ESLint を採用する理由: 既存の TypeScript コードベースとエコシステム互換性が高く、@typescript-eslint/recommended により型安全な静的解析を最小コストで導入できるため。
// 基本ルールセット: eslint:recommended, plugin:@typescript-eslint/recommended
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist/**"],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: globals.node,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...(tsPlugin.configs["eslint-recommended"]?.rules ?? {}),
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
