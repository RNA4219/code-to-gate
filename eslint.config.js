import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".test-temp/**",
      "fixtures/**",
      "schemas/**",
      "*.schema.json",
      "coverage/**",
      ".qh/**",
      "**/*.d.ts",
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
        vitest: "readonly",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_|^T$|^Mock|^Fake|^Stub",
          caughtErrorsIgnorePattern: "^_",
          vars: "all",
          args: "after-used",
          ignoreRestSiblings: true,
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "no-console": "off",
      "no-constant-condition": "warn",
      "prefer-const": "warn",
    },
  },
  // Test files: relax any warnings for test convenience
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);