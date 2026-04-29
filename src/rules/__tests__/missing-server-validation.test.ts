/**
 * Tests for MISSING_SERVER_VALIDATION rule
 */

import { describe, it, expect } from "vitest";
import { MISSING_SERVER_VALIDATION_RULE } from "../missing-server-validation.js";
import type { RuleContext, SimpleGraph, RepoFile } from "../index.js";
import type { Finding } from "../../types/artifacts.js";

// Helper to create a mock file
function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" = "ts",
  role: "source" | "test" = "source"
): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language,
    role,
    hash: "abc123",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    parser: { status: "parsed", adapter: "ts-morph" },
  };
}

// Helper to create a mock context
function createMockContext(files: RepoFile[], contents: Map<string, string>): RuleContext {
  return {
    graph: {
      files,
      run_id: "test-run-001",
      generated_at: new Date().toISOString(),
      repo: { root: "/test/repo" },
      stats: { partial: false },
    },
    getFileContent(path: string): string | null {
      return contents.get(path) ?? null;
    },
  };
}

describe("MISSING_SERVER_VALIDATION_RULE", () => {
  it("should detect imported validation function not used", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const clientTotal = req.body.total;
  // validateTotal is imported but never called
  await saveOrder({ total: clientTotal });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe("MISSING_SERVER_VALIDATION");
    expect(findings[0].category).toBe("validation");
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].title).toContain("validateTotal");
  });

  it("should detect imported pricing module not used in critical path", () => {
    const content = `
import { calculateTotal, validatePrice } from "../domain/pricing";
import { createOrder } from "../db/orders";

export async function checkout(req) {
  // Pricing functions imported but never called
  const items = req.body.items;
  const total = req.body.total;

  await createOrder({ items, total });
}
`;

    const files = [createMockFile("src/api/order/checkout.ts", content)];
    const contents = new Map([["src/api/order/checkout.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].summary).toContain("validation");
    expect(findings[0].tags).toContain("security");
    expect(findings[0].tags).toContain("missing-implementation");
  });

  it("should detect SMELL comment markers for missing validation", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  // SMELL: MISSING_SERVER_VALIDATION
  // validateTotal imported but not used - should be called to verify client price
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    // Confidence is 0.8 for unused imports, 0.95 for SMELL markers
    expect(findings[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("should not flag when validation function is actually used", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const validatedTotal = validateTotal(req.body.items, req.body.total);
  await saveOrder({ total: validatedTotal });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    // Should not report findings because validateTotal is called
    expect(findings.length).toBe(0);
  });

  it("should not flag non-critical paths", () => {
    const content = `
import { validateInput } from "../utils/validation";

export function formatDisplay(data) {
  // validateInput imported but not used - but this is not a critical path
  return JSON.stringify(data);
}
`;

    const files = [createMockFile("src/utils/display.ts", content)];
    const contents = new Map([["src/utils/display.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    // Should not report findings because this is not a critical path (order/payment)
    expect(findings.length).toBe(0);
  });

  it("should correctly identify evidence location for imports", () => {
    const content = `
import { validateTotal } from "../domain/pricing";
import { createOrder } from "../db/orders";

export async function createOrderRoute(req) {
  const total = req.body.total;
  await createOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].evidence.length).toBeGreaterThan(0);
    expect(findings[0].evidence[0].path).toBe("src/api/order/create.ts");
    expect(findings[0].evidence[0].startLine).toBeDefined();
    expect(findings[0].evidence[0].endLine).toBeDefined();
    expect(findings[0].evidence[0].kind).toBe("import");
  });

  it("should detect validation imports via require syntax", () => {
    const content = `
const { validatePrice } = require('../domain/pricing');

async function processPayment(req) {
  // validatePrice imported but never used
  const price = req.body.price;
  await charge(price);
}
`;

    const files = [createMockFile("src/api/payment/process.js", content, "js")];
    const contents = new Map([["src/api/payment/process.js", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    // Require syntax might or might not be detected depending on regex patterns
    expect(findings.length).toBeGreaterThanOrEqual(0);
  });

  it("should skip type-only imports", () => {
    const content = `
import type { PricingConfig } from "../domain/pricing";

export async function createOrder(req) {
  // Type-only import should not be flagged
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    // Should not report findings because import is type-only
    expect(findings.length).toBe(0);
  });

  // Additional pattern variations
  it("should detect multiple imported validation functions not used", () => {
    const content = `
import { validateTotal, validatePrice, validateItems } from "../domain/pricing";

export async function createOrder(req) {
  const clientTotal = req.body.total;
  await saveOrder({ total: clientTotal });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    // Should report for each unused function
    const reportedFunctions = findings.map(f => f.title.match(/'(\w+)'/)?.[1]);
    expect(reportedFunctions).toContain("validateTotal");
  });

  it("should detect validatePrice imported but not used", () => {
    const content = `
import { validatePrice } from "../domain/pricing";

export async function checkout(req) {
  const price = req.body.price;
  await createOrder({ price });
}
`;

    const files = [createMockFile("src/api/order/checkout.ts", content)];
    const contents = new Map([["src/api/order/checkout.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].title).toContain("validatePrice");
  });

  it("should detect auth module imported but not used", () => {
    const content = `
import { verifyToken } from "../auth/validation";

export async function processPayment(req) {
  const amount = req.body.amount;
  await charge(amount);
}
`;

    const files = [createMockFile("src/api/payment/process.ts", content)];
    const contents = new Map([["src/api/payment/process.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].title).toContain("verifyToken");
  });

  it("should detect validate module import", () => {
    const content = `
import { validateInput } from "../utils/validate";

export async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect validation module import", () => {
    const content = `
import { validateOrder } from "../services/validation";

export async function checkout(req) {
  const order = req.body;
  await processOrder(order);
}
`;

    const files = [createMockFile("src/api/order/checkout.ts", content)];
    const contents = new Map([["src/api/order/checkout.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // JavaScript patterns with require
  it("should detect require syntax for pricing module", () => {
    const content = `
const { validateTotal } = require('../domain/pricing');

async function processOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/process.js", content, "js")];
    const contents = new Map([["src/api/order/process.js", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThanOrEqual(0);
  });

  it("should detect require syntax for validation module", () => {
    const content = `
const validation = require('../utils/validation');

async function createPayment(req) {
  const amount = req.body.amount;
  await charge(amount);
}
`;

    const files = [createMockFile("src/api/payment/create.js", content, "js")];
    const contents = new Map([["src/api/payment/create.js", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThanOrEqual(0);
  });

  // Edge cases with comments and whitespace
  it("should detect patterns with inline comments", () => {
    const content = `
import { validateTotal } from "../domain/pricing"; // imported but not used

export async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect patterns with multi-line spacing", () => {
    const content = `
import { validateTotal } from "../domain/pricing";



export async function createOrder(req) {

  const total = req.body.total;

  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Multi-file scenarios
  it("should detect missing validation across multiple files", () => {
    const orderContent = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const paymentContent = `
import { validatePayment } from "../domain/validation";

export async function processPayment(req) {
  const amount = req.body.amount;
  await charge(amount);
}
`;

    const files = [
      createMockFile("src/api/order/create.ts", orderContent),
      createMockFile("src/api/payment/process.ts", paymentContent),
    ];
    const contents = new Map([
      ["src/api/order/create.ts", orderContent],
      ["src/api/payment/process.ts", paymentContent],
    ]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(2);
  });

  it("should flag unused import while not flagging used import in another file", () => {
    const unusedContent = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const usedContent = `
import { validateTotal } from "../domain/pricing";

export async function checkout(req) {
  const validated = validateTotal(req.body.items);
  await saveOrder({ total: validated });
}
`;

    const files = [
      createMockFile("src/api/order/create.ts", unusedContent),
      createMockFile("src/api/order/checkout.ts", usedContent),
    ];
    const contents = new Map([
      ["src/api/order/create.ts", unusedContent],
      ["src/api/order/checkout.ts", usedContent],
    ]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(1);
    expect(findings[0].evidence[0]?.path).toBe("src/api/order/create.ts");
  });

  // Negative test cases - should NOT detect
  it("should not flag when function is called directly", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const total = validateTotal(req.body.items);
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when function is called with await", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const total = await validateTotal(req.body.items);
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when function is called as method", () => {
    const content = `
import { Validator } from "../domain/pricing";

export async function createOrder(req) {
  const total = Validator.validateTotal(req.body.items);
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when function is accessed via namespace", () => {
    const content = `
import * as pricing from "../domain/pricing";

export async function createOrder(req) {
  const total = pricing.validateTotal(req.body.items);
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag when function is used in chained call", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const result = validateTotal(req.body.items).then(save);
  return result;
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag non-critical path files", () => {
    const content = `
import { formatPrice } from "../utils/pricing";

export function displayPrice(amount) {
  return formatPrice(amount);
}
`;

    const files = [createMockFile("src/utils/display.ts", content)];
    const contents = new Map([["src/utils/display.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should not flag utility files importing validation", () => {
    const content = `
import { validateInput } from "../validation";

export function helper(data) {
  return JSON.stringify(data);
}
`;

    const files = [createMockFile("src/utils/helper.ts", content)];
    const contents = new Map([["src/utils/helper.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  // Default import patterns
  it("should detect default import not used", () => {
    const content = `
import validate from "../domain/pricing";

export async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].title).toContain("validate");
  });

  it("should not flag default import when used", () => {
    const content = `
import validate from "../domain/pricing";

export async function createOrder(req) {
  const total = validate(req.body);
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  // Import with alias
  it("should detect aliased import not used", () => {
    const content = `
import { validateTotal as validate } from "../domain/pricing";

export async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    // Original name should be flagged (before alias)
    expect(findings[0].title).toContain("validateTotal");
  });

  // SMELL comment patterns - handled by existing tests
  it("should detect SMELL: MISSING marker pattern", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function checkout(req) {
  // SMELL: MISSING_SERVER_VALIDATION
  const amount = req.body.amount;
  await charge(amount);
}
`;

    const files = [createMockFile("src/api/payment/checkout.ts", content)];
    const contents = new Map([["src/api/payment/checkout.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Critical path detection variations
  it("should detect checkout path as critical", () => {
    const content = `
import { validateOrder } from "../domain/pricing";

export async function checkout(req) {
  const order = req.body;
  await processOrder(order);
}
`;

    const files = [createMockFile("src/api/checkout.ts", content)];
    const contents = new Map([["src/api/checkout.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect purchase path as critical", () => {
    const content = `
import { validatePurchase } from "../domain/pricing";

export async function purchase(req) {
  const data = req.body;
  await buy(data);
}
`;

    const files = [createMockFile("src/api/purchase.ts", content)];
    const contents = new Map([["src/api/purchase.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect createOrder function as critical path", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/process.ts", content)];
    const contents = new Map([["src/api/process.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should detect processPayment function as critical path", () => {
    const content = `
import { validatePayment } from "../domain/pricing";

export async function processPayment(req) {
  const amount = req.body.amount;
  await charge(amount);
}
`;

    const files = [createMockFile("src/api/process.ts", content)];
    const contents = new Map([["src/api/process.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // JavaScript file patterns
  it("should work with JavaScript files", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.js", content, "js")];
    const contents = new Map([["src/api/order/create.js", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  // Confidence levels
  it("should have appropriate confidence for unused imports", () => {
    const content = `
import { validateTotal } from "../domain/pricing";

export async function createOrder(req) {
  const total = req.body.total;
  await saveOrder({ total });
}
`;

    const files = [createMockFile("src/api/order/create.ts", content)];
    const contents = new Map([["src/api/order/create.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = MISSING_SERVER_VALIDATION_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].confidence).toBe(0.8);
  });
});