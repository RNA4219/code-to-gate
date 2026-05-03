/**
 * Tests for Type inference tracking (Phase 4)
 */

import { describe, it, expect } from "vitest";
import { parseTypeScriptFile } from "../ts-adapter.js";
import path from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

describe("Type inference tracking", () => {
  const tempDir = path.join(import.meta.dirname, "../../../.test-temp", "type-inference");
  const repoRoot = tempDir;

  beforeAll(() => {
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Function type extraction", () => {
    it("extracts return type from function", () => {
      const filePath = path.join(tempDir, "types-test.ts");
      writeFileSync(filePath, `
function calculatePrice(productId: string): number {
  return 100;
}
`);

      const result = parseTypeScriptFile(filePath, repoRoot, "file:types-test.ts");

      const funcSymbol = result.symbols.find(s => s.name === "calculatePrice");
      expect(funcSymbol).toBeDefined();
      expect(funcSymbol?.typeInfo?.returnType).toContain("number");
      expect(funcSymbol?.typeInfo?.parameterTypes?.length).toBe(1);
      expect(funcSymbol?.typeInfo?.parameterTypes?.[0]?.name).toBe("productId");
      expect(funcSymbol?.typeInfo?.parameterTypes?.[0]?.type).toContain("string");
    });

    it("extracts inferred return type", () => {
      const filePath = path.join(tempDir, "inferred-test.ts");
      writeFileSync(filePath, `
function greet(name: string) {
  return "Hello, " + name;
}
`);

      const result = parseTypeScriptFile(filePath, repoRoot, "file:inferred-test.ts");

      const funcSymbol = result.symbols.find(s => s.name === "greet");
      expect(funcSymbol).toBeDefined();
      expect(funcSymbol?.typeInfo?.returnType).toBeDefined();
      expect(funcSymbol?.typeInfo?.parameterTypes?.length).toBe(1);
    });

    it("handles functions without explicit types", () => {
      const filePath = path.join(tempDir, "no-types-test.ts");
      writeFileSync(filePath, `
function simpleFunc() {
  console.log("test");
}
`);

      const result = parseTypeScriptFile(filePath, repoRoot, "file:no-types-test.ts");

      const funcSymbol = result.symbols.find(s => s.name === "simpleFunc");
      expect(funcSymbol).toBeDefined();
      // typeInfo may be undefined or have inferred types
    });
  });

  describe("Method type extraction", () => {
    it("extracts method return type", () => {
      const filePath = path.join(tempDir, "method-test.ts");
      writeFileSync(filePath, `
class PaymentService {
  processPayment(amount: number): boolean {
    return true;
  }
}
`);

      const result = parseTypeScriptFile(filePath, repoRoot, "file:method-test.ts");

      const methodSymbol = result.symbols.find(s => s.name === "processPayment");
      expect(methodSymbol).toBeDefined();
      expect(methodSymbol?.kind).toBe("method");
      expect(methodSymbol?.typeInfo?.returnType).toContain("boolean");
      expect(methodSymbol?.typeInfo?.parameterTypes?.length).toBe(1);
      expect(methodSymbol?.typeInfo?.parameterTypes?.[0]?.name).toBe("amount");
      expect(methodSymbol?.typeInfo?.parameterTypes?.[0]?.type).toContain("number");
    });
  });

  describe("Class implements extraction", () => {
    it("extracts implements interface", () => {
      const filePath = path.join(tempDir, "implements-test.ts");
      writeFileSync(filePath, `
interface IPayment {
  process(): void;
}

class PaymentProcessor implements IPayment {
  process(): void {}
}
`);

      const result = parseTypeScriptFile(filePath, repoRoot, "file:implements-test.ts");

      const classSymbol = result.symbols.find(s => s.name === "PaymentProcessor" && s.kind === "class");
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.typeInfo?.implements).toContain("IPayment");
    });

    it("handles class without implements", () => {
      const filePath = path.join(tempDir, "no-implements-test.ts");
      writeFileSync(filePath, `
class SimpleClass {
  method() {}
}
`);

      const result = parseTypeScriptFile(filePath, repoRoot, "file:no-implements-test.ts");

      const classSymbol = result.symbols.find(s => s.kind === "class");
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.typeInfo?.implements).toBeUndefined();
    });
  });

  describe("Complex type extraction", () => {
    it("extracts generic types", () => {
      const filePath = path.join(tempDir, "generic-test.ts");
      writeFileSync(filePath, `
function mapItems<T, U>(items: T[], mapper: (item: T) => U): U[] {
  return items.map(mapper);
}
`);

      const result = parseTypeScriptFile(filePath, repoRoot, "file:generic-test.ts");

      const funcSymbol = result.symbols.find(s => s.name === "mapItems");
      expect(funcSymbol).toBeDefined();
      expect(funcSymbol?.typeInfo?.returnType).toBeDefined();
      expect(funcSymbol?.typeInfo?.parameterTypes?.length).toBe(2);
    });

    it("extracts async function return type", () => {
      const filePath = path.join(tempDir, "async-test.ts");
      writeFileSync(filePath, `
async function fetchData(url: string): Promise<string> {
  return fetch(url).then(r => r.text());
}
`);

      const result = parseTypeScriptFile(filePath, repoRoot, "file:async-test.ts");

      const funcSymbol = result.symbols.find(s => s.name === "fetchData");
      expect(funcSymbol).toBeDefined();
      expect(funcSymbol?.async).toBe(true);
      expect(funcSymbol?.typeInfo?.returnType).toContain("Promise");
    });
  });
});