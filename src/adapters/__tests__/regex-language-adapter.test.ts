import { describe, expect, it } from "vitest";
import path from "node:path";
import { parseRegexLanguageFile, type RegexLanguage } from "../regex-language-adapter.js";

const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-multilang");

describe("regex-language-adapter", () => {
  const cases: Array<{ language: RegexLanguage; file: string; symbol: string; adapter: string }> = [
    { language: "go", file: "go/main.go", symbol: "CreateOrder", adapter: "go-regex-v0" },
    { language: "rs", file: "rust/src/main.rs", symbol: "create_order", adapter: "rs-regex-v0" },
    { language: "java", file: "java/src/main/java/OrderController.java", symbol: "OrderController", adapter: "java-regex-v0" },
    { language: "php", file: "php/src/OrderController.php", symbol: "OrderController", adapter: "php-regex-v0" },
  ];

  for (const testCase of cases) {
    it(`parses ${testCase.language} files`, () => {
      const filePath = path.join(fixturesDir, testCase.file);
      const result = parseRegexLanguageFile(filePath, fixturesDir, `file:${testCase.file}`, testCase.language);

      expect(result.parserStatus).toBe("parsed");
      expect(result.parserAdapter).toBe(testCase.adapter);
      expect(result.symbols.some((symbol) => symbol.name === testCase.symbol)).toBe(true);
      expect(result.relations.length).toBeGreaterThan(0);
    });
  }
});
