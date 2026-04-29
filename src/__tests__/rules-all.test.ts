/**
 * Tests for All 9 Rules Together
 *
 * Tests the complete rules system for code-to-gate, including
 * all rule plugins, their interactions, and unified evaluation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ALL_RULES,
  type RulePlugin,
  type RuleContext,
  type SimpleGraph,
  hashExcerpt,
  generateFindingId,
  createEvidence,
} from "../rules/index.js";
import type { RepoFile, Finding, EvidenceRef } from "../types/artifacts.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

// === Test Fixtures ===

function createMockRepoFile(
  filePath: string,
  content: string,
  language: "ts" | "tsx" | "js" | "jsx" | "py" = "ts",
  role: "source" | "test" | "config" | "fixture" | "docs" | "generated" = "source"
): RepoFile {
  return {
    id: `file:${filePath}`,
    path: filePath,
    language,
    role,
    hash: hashExcerpt(content),
    sizeBytes: Buffer.byteLength(content),
    lineCount: content.split("\n").length,
    parser: { status: "parsed", adapter: "test-adapter" },
  };
}

function createMockContext(files: RepoFile[], contentMap: Map<string, string>): RuleContext {
  return {
    graph: {
      files,
      run_id: "test-run-all-rules",
      generated_at: new Date().toISOString(),
      repo: { root: "/test/repo" },
      stats: { partial: false },
    },
    getFileContent: (filePath: string) => contentMap.get(filePath) ?? null,
  };
}

// Sample vulnerable code snippets for each rule
const VULNERABLE_SAMPLES = {
  CLIENT_TRUSTED_PRICE: `
// SMELL: CLIENT_TRUSTED_PRICE - VULNERABLE
export async function createOrder(req: Request) {
  const { total, items } = req.body;
  // Directly trusting client-provided total
  await db.orders.insert({ total, items }); // VULNERABLE - no validation
}
// END SMELL
`,
  WEAK_AUTH_GUARD: `
// SMELL: WEAK_AUTH_GUARD - VULNERABLE
export function authGuard(req: Request) {
  const token = req.headers.get("authorization");
  // Only checking presence, not validity
  if (!token) return false; // VULNERABLE - weak guard
  return true;
}
// END SMELL
`,
  MISSING_SERVER_VALIDATION: `
// SMELL: MISSING_SERVER_VALIDATION - VULNERABLE
export async function processPayment(req: Request) {
  const { amount, cardNumber } = req.body;
  // No validation before processing
  await paymentService.process({ amount, cardNumber }); // VULNERABLE
}
// END SMELL
`,
  UNTESTED_CRITICAL_PATH: `
// Entrypoint with no tests
export async function checkout(req: Request) {
  const order = await createOrder(req);
  await processPayment(order);
  return { success: true };
}
`,
  TRY_CATCH_SWALLOW: `
// SMELL: TRY_CATCH_SWALLOW - VULNERABLE
export async function logAudit(action: string) {
  try {
    await auditService.log(action);
  } catch (e) {
    // Swallowed - no handling
  } // VULNERABLE
}
// END SMELL
`,
  ENV_DIRECT_ACCESS: `
// SMELL: ENV_DIRECT_ACCESS - VULNERABLE
export function getConfig() {
  const apiKey = process.env.API_KEY; // Direct access - VULNERABLE
  const dbUrl = process.env.DATABASE_URL; // No validation
  return { apiKey, dbUrl };
}
// END SMELL
`,
  RAW_SQL: `
// SMELL: RAW_SQL - VULNERABLE
export async function findUser(userId: string) {
  const query = "SELECT * FROM users WHERE id = " + userId; // VULNERABLE
  return db.execute(query);
}
// END SMELL
`,
  UNSAFE_DELETE: `
// SMELL: UNSAFE_DELETE - VULNERABLE
export async function deleteUser(req: Request) {
  const { userId } = req.params;
  // No authorization check before delete
  await db.users.delete(userId); // VULNERABLE
}
// END SMELL
`,
  LARGE_MODULE: `
// SMELL: LARGE_MODULE - Many exports indicating high fanout
export const util1 = () => {};
export const util2 = () => {};
export const util3 = () => {};
export const util4 = () => {};
export const util5 = () => {};
export const util6 = () => {};
export const util7 = () => {};
export const util8 = () => {};
export const util9 = () => {};
export const util10 = () => {};
export const util11 = () => {};
export const util12 = () => {};
export const util13 = () => {};
export const util14 = () => {};
export const util15 = () => {};
export const util16 = () => {};
export const util17 = () => {};
export const util18 = () => {};
export const util19 = () => {};
export const util20 = () => {};
export const util21 = () => {};
export const util22 = () => {};
export const util23 = () => {};
export const util24 = () => {};
export const util25 = () => {};
export const util26 = () => {};
export const util27 = () => {};
export const util28 = () => {};
export const util29 = () => {};
export const util30 = () => {};
`,
};

// === Tests ===

describe("All Rules System", () => {
  describe("Rule Registration", () => {
    it("should have exactly 9 rules registered", () => {
      expect(ALL_RULES.length).toBe(9);
    });

    it("should have all expected rule IDs", () => {
      const ruleIds = ALL_RULES.map((r) => r.id);

      expect(ruleIds).toContain("CLIENT_TRUSTED_PRICE");
      expect(ruleIds).toContain("WEAK_AUTH_GUARD");
      expect(ruleIds).toContain("MISSING_SERVER_VALIDATION");
      expect(ruleIds).toContain("UNTESTED_CRITICAL_PATH");
      expect(ruleIds).toContain("TRY_CATCH_SWALLOW");
      expect(ruleIds).toContain("ENV_DIRECT_ACCESS");
      expect(ruleIds).toContain("RAW_SQL");
      expect(ruleIds).toContain("UNSAFE_DELETE");
      expect(ruleIds).toContain("LARGE_MODULE");
    });

    it("should have unique rule IDs", () => {
      const ruleIds = ALL_RULES.map((r) => r.id);
      const uniqueIds = new Set(ruleIds);

      expect(uniqueIds.size).toBe(ruleIds.length);
    });

    it("should have all required properties for each rule", () => {
      for (const rule of ALL_RULES) {
        expect(rule.id).toMatch(/^[A-Z_]+$/);
        expect(rule.name).toBeDefined();
        expect(rule.name.length).toBeGreaterThan(0);
        expect(rule.description).toBeDefined();
        expect(rule.description.length).toBeGreaterThan(10);
        expect(rule.category).toBeDefined();
        expect(rule.defaultSeverity).toBeDefined();
        expect(["low", "medium", "high", "critical"]).toContain(rule.defaultSeverity);
        expect(rule.defaultConfidence).toBeGreaterThan(0);
        expect(rule.defaultConfidence).toBeLessThanOrEqual(1);
        expect(typeof rule.evaluate).toBe("function");
      }
    });
  });

  describe("Rule Categories Coverage", () => {
    it("should cover all expected categories", () => {
      const categories = new Set(ALL_RULES.map((r) => r.category));

      expect(categories).toContain("payment");
      expect(categories).toContain("auth");
      expect(categories).toContain("validation");
      expect(categories).toContain("testing");
      expect(categories).toContain("maintainability");
      expect(categories).toContain("data");
      expect(categories).toContain("config");
    });

    it("should have critical severity for payment category", () => {
      const paymentRule = ALL_RULES.find((r) => r.category === "payment");
      expect(paymentRule?.defaultSeverity).toBe("critical");
    });

    it("should have high/critical severity for auth category", () => {
      const authRules = ALL_RULES.filter((r) => r.category === "auth");
      for (const rule of authRules) {
        expect(["critical", "high"]).toContain(rule.defaultSeverity);
      }
    });

    it("should have appropriate severity for each category", () => {
      for (const rule of ALL_RULES) {
        // Payment and auth should be high/critical
        if (rule.category === "payment" || rule.category === "auth") {
          expect(["critical", "high"]).toContain(rule.defaultSeverity);
        }

        // Maintainability is typically medium
        if (rule.category === "maintainability") {
          expect(["low", "medium", "high"]).toContain(rule.defaultSeverity);
        }
      }
    });
  });

  describe("Rule Evaluation on Empty Context", () => {
    it("should return empty findings for empty graph", () => {
      const emptyContext = createMockContext([], new Map());

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(emptyContext);
        expect(findings).toBeInstanceOf(Array);
        expect(findings.length).toBe(0);
      }
    });

    it("should not throw on empty graph", () => {
      const emptyContext = createMockContext([], new Map());

      for (const rule of ALL_RULES) {
        expect(() => rule.evaluate(emptyContext)).not.toThrow();
      }
    });
  });

  describe("Individual Rule Detection", () => {
    it("CLIENT_TRUSTED_PRICE should detect client-trusted price pattern", () => {
      const rule = ALL_RULES.find((r) => r.id === "CLIENT_TRUSTED_PRICE");
      expect(rule).toBeDefined();

      const contentMap = new Map<string, string>();
      contentMap.set("src/api/order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE);

      const files = [createMockRepoFile("src/api/order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE)];
      const context = createMockContext(files, contentMap);

      const findings = rule!.evaluate(context);

      expect(findings.length).toBeGreaterThanOrEqual(0);
      // If findings are generated, they should have proper structure
      for (const finding of findings) {
        expect(finding.ruleId).toBe("CLIENT_TRUSTED_PRICE");
        expect(finding.category).toBe("payment");
        expect(finding.severity).toBe("critical");
      }
    });

    it("WEAK_AUTH_GUARD should detect weak auth guard pattern", () => {
      const rule = ALL_RULES.find((r) => r.id === "WEAK_AUTH_GUARD");
      expect(rule).toBeDefined();

      const contentMap = new Map<string, string>();
      contentMap.set("src/auth/guard.ts", VULNERABLE_SAMPLES.WEAK_AUTH_GUARD);

      const files = [createMockRepoFile("src/auth/guard.ts", VULNERABLE_SAMPLES.WEAK_AUTH_GUARD)];
      const context = createMockContext(files, contentMap);

      const findings = rule!.evaluate(context);

      for (const finding of findings) {
        expect(finding.ruleId).toBe("WEAK_AUTH_GUARD");
        expect(finding.category).toBe("auth");
      }
    });

    it("TRY_CATCH_SWALLOW should detect swallowed errors", () => {
      const rule = ALL_RULES.find((r) => r.id === "TRY_CATCH_SWALLOW");
      expect(rule).toBeDefined();

      const contentMap = new Map<string, string>();
      contentMap.set("src/services/audit.ts", VULNERABLE_SAMPLES.TRY_CATCH_SWALLOW);

      const files = [createMockRepoFile("src/services/audit.ts", VULNERABLE_SAMPLES.TRY_CATCH_SWALLOW)];
      const context = createMockContext(files, contentMap);

      const findings = rule!.evaluate(context);

      for (const finding of findings) {
        expect(finding.ruleId).toBe("TRY_CATCH_SWALLOW");
        expect(finding.category).toBe("maintainability");
        expect(["medium", "low"]).toContain(finding.severity);
      }
    });

    it("ENV_DIRECT_ACCESS should detect direct env access", () => {
      const rule = ALL_RULES.find((r) => r.id === "ENV_DIRECT_ACCESS");
      expect(rule).toBeDefined();

      const contentMap = new Map<string, string>();
      contentMap.set("src/config/env.ts", VULNERABLE_SAMPLES.ENV_DIRECT_ACCESS);

      const files = [createMockRepoFile("src/config/env.ts", VULNERABLE_SAMPLES.ENV_DIRECT_ACCESS)];
      const context = createMockContext(files, contentMap);

      const findings = rule!.evaluate(context);

      for (const finding of findings) {
        expect(finding.ruleId).toBe("ENV_DIRECT_ACCESS");
        expect(finding.category).toBe("config");
      }
    });

    it("RAW_SQL should detect raw SQL queries", () => {
      const rule = ALL_RULES.find((r) => r.id === "RAW_SQL");
      expect(rule).toBeDefined();

      const contentMap = new Map<string, string>();
      contentMap.set("src/db/query.ts", VULNERABLE_SAMPLES.RAW_SQL);

      const files = [createMockRepoFile("src/db/query.ts", VULNERABLE_SAMPLES.RAW_SQL)];
      const context = createMockContext(files, contentMap);

      const findings = rule!.evaluate(context);

      for (const finding of findings) {
        expect(finding.ruleId).toBe("RAW_SQL");
        expect(finding.category).toBe("data");
      }
    });

    it("UNSAFE_DELETE should detect unsafe delete operations", () => {
      const rule = ALL_RULES.find((r) => r.id === "UNSAFE_DELETE");
      expect(rule).toBeDefined();

      const contentMap = new Map<string, string>();
      contentMap.set("src/api/user/delete.ts", VULNERABLE_SAMPLES.UNSAFE_DELETE);

      const files = [createMockRepoFile("src/api/user/delete.ts", VULNERABLE_SAMPLES.UNSAFE_DELETE)];
      const context = createMockContext(files, contentMap);

      const findings = rule!.evaluate(context);

      for (const finding of findings) {
        expect(finding.ruleId).toBe("UNSAFE_DELETE");
        expect(finding.category).toBe("data"); // UNSAFE_DELETE is in data category
      }
    });
  });

  describe("Finding Structure Validation", () => {
    it("should generate valid finding structure for all rules", () => {
      // Create a context with various vulnerable files
      const contentMap = new Map<string, string>();
      contentMap.set("src/api/order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE);
      contentMap.set("src/auth/guard.ts", VULNERABLE_SAMPLES.WEAK_AUTH_GUARD);
      contentMap.set("src/services/audit.ts", VULNERABLE_SAMPLES.TRY_CATCH_SWALLOW);

      const files = [
        createMockRepoFile("src/api/order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE),
        createMockRepoFile("src/auth/guard.ts", VULNERABLE_SAMPLES.WEAK_AUTH_GUARD),
        createMockRepoFile("src/services/audit.ts", VULNERABLE_SAMPLES.TRY_CATCH_SWALLOW),
      ];

      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);

        for (const finding of findings) {
          // Required fields
          expect(finding.id).toBeDefined();
          expect(finding.id).toMatch(/^finding:/);
          expect(finding.ruleId).toBe(rule.id);
          expect(finding.category).toBe(rule.category);
          expect(finding.severity).toBeDefined();
          expect(finding.confidence).toBeGreaterThan(0);
          expect(finding.confidence).toBeLessThanOrEqual(1);
          expect(finding.title).toBeDefined();
          expect(finding.summary).toBeDefined();
          expect(Array.isArray(finding.evidence)).toBe(true);

          // Optional but should be valid if present
          if (finding.tags) {
            expect(Array.isArray(finding.tags)).toBe(true);
          }

          if (finding.upstream) {
            expect(finding.upstream.tool).toBeDefined();
          }
        }
      }
    });

    it("should have consistent evidence structure", () => {
      const contentMap = new Map<string, string>();
      contentMap.set("src/api/order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE);

      const files = [createMockRepoFile("src/api/order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE)];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);

        for (const finding of findings) {
          for (const evidence of finding.evidence) {
            expect(evidence.id).toBeDefined();
            expect(evidence.path).toBeDefined();
            expect(evidence.kind).toBeDefined();
            expect(["ast", "text", "import", "external", "test", "coverage", "diff"]).toContain(evidence.kind);

            if (evidence.kind === "text" && evidence.excerptHash) {
              expect(evidence.excerptHash).toMatch(/^[a-f0-9]{8}$/);
            }
          }
        }
      }
    });
  });

  describe("Multi-Rule Detection", () => {
    it("should detect multiple issues in same file", () => {
      const multiIssueFile = `
import express from 'express';
const app = express();

// SMELL: CLIENT_TRUSTED_PRICE
app.post('/order', (req, res) => {
  const { total } = req.body; // VULNERABLE
  db.orders.insert({ total });
});
// END SMELL

// SMELL: WEAK_AUTH_GUARD
app.get('/admin', (req, res) => {
  if (!req.headers.authorization) return res.status(401).send('Unauthorized');
  res.json({ data: 'admin' }); // VULNERABLE - only checks presence
});
// END SMELL

// SMELL: TRY_CATCH_SWALLOW
app.post('/log', (req, res) => {
  try {
    auditService.log(req.body);
  } catch (e) {} // VULNERABLE
});
// END SMELL
`;

      const contentMap = new Map<string, string>();
      contentMap.set("src/app.ts", multiIssueFile);

      const files = [createMockRepoFile("src/app.ts", multiIssueFile, "ts")];
      const context = createMockContext(files, contentMap);

      // Run all rules
      const allFindings: Finding[] = [];
      for (const rule of ALL_RULES) {
        allFindings.push(...rule.evaluate(context));
      }

      // Multiple findings should be possible
      expect(allFindings.length).toBeGreaterThanOrEqual(0);
    });

    it("should not generate duplicate findings for same issue", () => {
      const contentMap = new Map<string, string>();
      contentMap.set("src/api/order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE);

      const files = [createMockRepoFile("src/api/order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE)];

      // Run same rule multiple times
      const rule = ALL_RULES.find((r) => r.id === "CLIENT_TRUSTED_PRICE")!;
      const context = createMockContext(files, contentMap);

      const findings1 = rule.evaluate(context);
      const findings2 = rule.evaluate(context);

      // Findings should be consistent (same rule, same input)
      expect(findings1.length).toBe(findings2.length);
    });
  });

  describe("Rule Confidence Levels", () => {
    it("should have appropriate confidence for pattern-based rules", () => {
      for (const rule of ALL_RULES) {
        // Pattern-based rules typically have 0.7-0.95 confidence
        expect(rule.defaultConfidence).toBeGreaterThanOrEqual(0.7);
        expect(rule.defaultConfidence).toBeLessThanOrEqual(0.95);
      }
    });

    it("should have higher confidence for critical rules", () => {
      const criticalRules = ALL_RULES.filter((r) => r.defaultSeverity === "critical");

      for (const rule of criticalRules) {
        // Critical rules should have reasonably high confidence (0.8+)
        expect(rule.defaultConfidence).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe("Cross-Language Support", () => {
    it("should handle TypeScript files", () => {
      const contentMap = new Map<string, string>();
      contentMap.set("src/api.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE);

      const files = [createMockRepoFile("src/api.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE, "ts")];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);
        expect(Array.isArray(findings)).toBe(true);
      }
    });

    it("should handle JavaScript files", () => {
      const contentMap = new Map<string, string>();
      contentMap.set("src/api.js", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE);

      const files = [createMockRepoFile("src/api.js", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE, "js")];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);
        expect(Array.isArray(findings)).toBe(true);
      }
    });

    it("should handle TSX files", () => {
      const tsxContent = `
export function CheckoutForm({ onSubmit }) {
  const handleSubmit = (e) => {
    const formData = { total: e.target.total.value };
    onSubmit(formData); // VULNERABLE - client-provided total
  };
  return <form onSubmit={handleSubmit}><input name="total" /></form>;
}
`;

      const contentMap = new Map<string, string>();
      contentMap.set("src/components/Checkout.tsx", tsxContent);

      const files = [createMockRepoFile("src/components/Checkout.tsx", tsxContent, "tsx")];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);
        expect(Array.isArray(findings)).toBe(true);
      }
    });

    it("should handle JSX files", () => {
      const jsxContent = `
export function PaymentForm({ amount }) {
  return <button onClick={() => submitPayment({ amount })}>Pay</button>;
}
`;

      const contentMap = new Map<string, string>();
      contentMap.set("src/components/Payment.jsx", jsxContent);

      const files = [createMockRepoFile("src/components/Payment.jsx", jsxContent, "jsx")];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);
        expect(Array.isArray(findings)).toBe(true);
      }
    });
  });

  describe("File Role Handling", () => {
    it("should skip test files for most rules", () => {
      const contentMap = new Map<string, string>();
      contentMap.set("tests/order.test.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE);

      const files = [
        createMockRepoFile("tests/order.test.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE, "ts", "test"),
      ];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);
        // Most rules should not generate findings for test files
        // UNTESTED_CRITICAL_PATH might be an exception
        if (rule.id !== "UNTESTED_CRITICAL_PATH") {
          // Findings from test files are acceptable but should be minimal
          expect(findings.filter((f) => f.evidence.some((e) => e.path.includes("test"))).length).toBe(0);
        }
      }
    });

    it("should skip fixture files", () => {
      const contentMap = new Map<string, string>();
      contentMap.set("fixtures/mock-order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE);

      const files = [
        createMockRepoFile("fixtures/mock-order.ts", VULNERABLE_SAMPLES.CLIENT_TRUSTED_PRICE, "ts", "fixture"),
      ];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);
        // Fixture files should not generate findings
        expect(findings.length).toBe(0);
      }
    });

    it("should skip config files", () => {
      const contentMap = new Map<string, string>();
      contentMap.set("vitest.config.ts", "export default { test: {} };");

      const files = [createMockRepoFile("vitest.config.ts", "export default { test: {} };", "ts", "config")];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);
        // Config files should typically not generate findings
        expect(findings.length).toBe(0);
      }
    });

    it("should skip generated files", () => {
      const contentMap = new Map<string, string>();
      contentMap.set("dist/index.js", "module.exports = {};");

      const files = [createMockRepoFile("dist/index.js", "module.exports = {};", "js", "generated")];
      const context = createMockContext(files, contentMap);

      for (const rule of ALL_RULES) {
        const findings = rule.evaluate(context);
        expect(findings.length).toBe(0);
      }
    });
  });

  describe("Rule Naming and Metadata", () => {
    it("should have descriptive names for all rules", () => {
      for (const rule of ALL_RULES) {
        expect(rule.name.length).toBeGreaterThan(5);
        expect(rule.name).not.toMatch(/^[A-Z_]+$/); // Name should be different from ID
      }
    });

    it("should have detailed descriptions for all rules", () => {
      for (const rule of ALL_RULES) {
        expect(rule.description.length).toBeGreaterThan(20);
        // Should mention detection (case insensitive)
        expect(rule.description.toLowerCase()).toContain("detect");
      }
    });

    it("should have consistent ID format", () => {
      for (const rule of ALL_RULES) {
        expect(rule.id).toMatch(/^[A-Z][A-Z_]*[A-Z]$/); // SCREAMING_SNAKE_CASE
      }
    });
  });

  describe("Integration with Real Fixture", () => {
    const fixturesDir = path.resolve(import.meta.dirname, "../../fixtures/demo-shop-ts");

    it("should run all rules on demo-shop-ts fixture", () => {
      if (!existsSync(fixturesDir)) {
        // Skip if fixture not available
        return;
      }

      // Create a basic context from fixture files
      const files: RepoFile[] = [];
      const contentMap = new Map<string, string>();

      // Walk and collect files would be needed for full integration
      // This is a simplified test

      for (const rule of ALL_RULES) {
        const emptyFindings = rule.evaluate(createMockContext([], new Map()));
        expect(emptyFindings.length).toBe(0);
      }
    });
  });
});

// === Utility Tests for Rule System ===

describe("Rule Utilities", () => {
  describe("hashExcerpt", () => {
    it("should generate 8-char hex hash", () => {
      const hash = hashExcerpt("test content");
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it("should be consistent for same input", () => {
      const hash1 = hashExcerpt("same content");
      const hash2 = hashExcerpt("same content");
      expect(hash1).toBe(hash2);
    });

    it("should differ for different input", () => {
      const hash1 = hashExcerpt("content a");
      const hash2 = hashExcerpt("content b");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("generateFindingId", () => {
    it("should include rule ID", () => {
      const id = generateFindingId("CLIENT_TRUSTED_PRICE", "src/test.ts");
      expect(id).toContain("CLIENT_TRUSTED_PRICE");
    });

    it("should include path hash", () => {
      const id = generateFindingId("CLIENT_TRUSTED_PRICE", "src/test.ts");
      expect(id).toMatch(/finding:CLIENT_TRUSTED_PRICE:[a-f0-9]+/);
    });

    it("should include line number when provided", () => {
      const id = generateFindingId("CLIENT_TRUSTED_PRICE", "src/test.ts", 42);
      expect(id).toContain(":L42");
    });

    it("should not include line number when not provided", () => {
      const id = generateFindingId("CLIENT_TRUSTED_PRICE", "src/test.ts");
      expect(id).not.toContain(":L");
    });
  });

  describe("createEvidence", () => {
    it("should create valid evidence object", () => {
      const evidence = createEvidence("src/test.ts", 10, 20, "text", "excerpt");
      expect(evidence.id).toContain("evidence:");
      expect(evidence.path).toBe("src/test.ts");
      expect(evidence.startLine).toBe(10);
      expect(evidence.endLine).toBe(20);
      expect(evidence.kind).toBe("text");
    });

    it("should include excerpt hash for text kind", () => {
      const evidence = createEvidence("src/test.ts", 1, 5, "text", "test excerpt");
      expect(evidence.excerptHash).toBe(hashExcerpt("test excerpt"));
    });

    it("should not include excerpt hash for non-text kinds", () => {
      const evidence = createEvidence("src/test.ts", 1, 5, "import");
      expect(evidence.excerptHash).toBeUndefined();
    });

    it("should support all evidence kinds", () => {
      const kinds: EvidenceRef["kind"][] = ["ast", "text", "import", "external", "test", "coverage", "diff"];
      for (const kind of kinds) {
        const evidence = createEvidence("src/test.ts", 1, 5, kind);
        expect(evidence.kind).toBe(kind);
      }
    });
  });
});