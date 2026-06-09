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
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  // Tree-sitter adapters: external library types require any
  {
    files: ["src/adapters/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  // Core modules: type-guarded non-null assertions are safe
  {
    files: [
      "src/core/**/*.ts",
      "src/evidence/**/*.ts",
      "src/parallel/**/*.ts",
      "src/plugin/**/*.ts",
      "src/rules/**/*.ts",
      "src/viewer/**/*.ts",
      "src/cli/**/*.ts",
      "src/llm/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  // Architecture boundary rules - enforce clean dependency direction
  // Phase 7: Dependency boundary enforcement
  {
    files: ["src/types/**/*.ts"],
    ignores: ["src/types/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**"],
              message: "types layer is the innermost layer and cannot import from other src layers. Only import from external packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/reporters/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../cli/**"],
              message: "reporters cannot import from cli layer. CLI should pass data to reporters, not reporters importing from CLI.",
            },
            {
              group: ["../application/**"],
              message: "reporters cannot import from application layer. Application orchestrates rules, reporters format artifacts. Import evaluateRules directly from application in CLI.",
            },
            {
              group: ["../adapters/**"],
              message: "reporters cannot import from adapters layer. Use ApplicationContext for service access.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/rules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../cli/**"],
              message: "rules cannot import from cli layer.",
            },
            {
              group: ["../adapters/**"],
              message: "rules cannot import from adapters layer. Use RuleContext for file content access.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    ignores: ["src/application/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message: "application layer cannot import Node.js APIs directly. Inject contracts or load data in the CLI composition root.",
            },
            {
              group: ["../cli/**"],
              message: "application layer cannot import from cli layer. CLI is the composition root that wires application dependencies.",
            },
            {
              group: ["../reporters/**"],
              message: "application layer cannot import from reporters layer. Application orchestrates rules, reporters format artifacts - dependency should flow CLI→application→rules/core.",
            },
            {
              group: ["../adapters/**"],
              message: "application layer cannot import concrete adapters. Use injected ApplicationContext services instead.",
            },
          ],
        },
      ],
    },
  },
  // Core layer boundary rules
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../cli/**"],
              message: "core layer cannot import from cli layer. Core contains pure logic, CLI is composition root.",
            },
            {
              group: ["../application/**"],
              message: "core layer cannot import from application layer. Core provides pure logic to application.",
            },
            {
              group: ["../reporters/**"],
              message: "core layer cannot import from reporters layer. Core provides data, reporters format output.",
            },
            {
              group: ["../adapters/**"],
              message: "core layer cannot import from adapters layer. Use ParserRegistry interface from types/contracts.ts instead.",
            },
          ],
        },
      ],
    },
  },
  // Adapters layer boundary rules
  {
    files: ["src/adapters/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../cli/**"],
              message: "adapters cannot import from cli layer. Adapters implement low-level services.",
            },
            {
              group: ["../application/**"],
              message: "adapters cannot import from application layer. Adapters provide services to application via ApplicationContext.",
            },
            {
              group: ["../reporters/**"],
              message: "adapters cannot import from reporters layer. Adapters provide services, reporters format output.",
            },
          ],
        },
      ],
    },
  },
);
