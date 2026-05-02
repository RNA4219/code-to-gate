/**
 * Tests for Invariant Generator
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  buildInvariantsFromFindings,
  writeInvariantsJson,
} from "../invariant-generator.js";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { FindingsArtifact, Finding, EvidenceRef } from "../../types/artifacts.js";

const TEMP_DIR = path.join(tmpdir(), "ctg-invariant-test");

// Helper: Create evidence
function createEvidence(path: string, startLine?: number): EvidenceRef[] {
  return [{
    id: `evidence-test-${path}`,
    path,
    startLine,
    kind: "text",
    excerptHash: "abc123",
  }];
}

// Helper: Create findings artifact
function createFindings(findings: Finding[] = []): FindingsArtifact {
  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: "test-run-invariant",
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: "1.0.0", plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings,
    unsupported_claims: [],
  };
}

describe("Invariant Generator", () => {
  beforeAll(() => {
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe("buildInvariantsFromFindings", () => {
    it("generates invariants from critical findings", () => {
      const findings = createFindings([
        {
          id: "finding-CLIENT_TRUSTED_PRICE-001",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.9,
          title: "Client trusted price",
          summary: "Price is trusted from client",
          evidence: createEvidence("src/api/order.ts", 24),
          tags: ["payment", "security"],
        },
      ]);

      const invariants = buildInvariantsFromFindings(findings, "test-run", "/test/repo");

      expect(invariants.artifact).toBe("invariants");
      expect(invariants.schema).toBe("invariants@v1");
      expect(invariants.invariants.length).toBeGreaterThan(0);
      expect(invariants.invariants[0].kind).toBe("business");
      expect(invariants.invariants[0].statement).toContain("server");
    });

    it("generates security invariants for auth findings", () => {
      const findings = createFindings([
        {
          id: "finding-WEAK_AUTH_GUARD-001",
          ruleId: "WEAK_AUTH_GUARD",
          category: "auth",
          severity: "critical",
          confidence: 0.95,
          title: "Weak auth guard",
          summary: "Auth guard only checks header presence",
          evidence: createEvidence("src/auth/guard.ts", 14),
          tags: ["auth", "security"],
        },
      ]);

      const invariants = buildInvariantsFromFindings(findings, "test-run", "/test/repo");

      expect(invariants.invariants.length).toBeGreaterThan(0);
      expect(invariants.invariants[0].kind).toBe("security");
    });

    it("skips low confidence findings", () => {
      const findings = createFindings([
        {
          id: "finding-low-confidence",
          ruleId: "MISSING_SERVER_VALIDATION",
          category: "validation",
          severity: "medium",
          confidence: 0.5,
          title: "Missing validation",
          summary: "Validation might be missing",
          evidence: createEvidence("src/utils.ts", 10),
          tags: ["validation"],
        },
      ]);

      const invariants = buildInvariantsFromFindings(findings, "test-run", "/test/repo");

      expect(invariants.invariants.length).toBe(0);
    });

    it("generates technical invariants for testing findings", () => {
      const findings = createFindings([
        {
          id: "finding-UNTESTED_CRITICAL_PATH-001",
          ruleId: "UNTESTED_CRITICAL_PATH",
          category: "testing",
          severity: "high",
          confidence: 0.9,
          title: "Untested critical path",
          summary: "Critical path has no tests",
          evidence: createEvidence("src/api/checkout.ts", 50),
          tags: ["testing", "coverage"],
        },
      ]);

      const invariants = buildInvariantsFromFindings(findings, "test-run", "/test/repo");

      expect(invariants.invariants.length).toBeGreaterThan(0);
      expect(invariants.invariants[0].kind).toBe("technical");
    });

    it("includes rationale and sourceFindingIds", () => {
      const findings = createFindings([
        {
          id: "finding-test-001",
          ruleId: "RAW_SQL",
          category: "security",
          severity: "critical",
          confidence: 0.95,
          title: "Raw SQL query",
          summary: "SQL query without parameters",
          evidence: createEvidence("src/db/query.ts", 20),
          tags: ["security", "sql"],
        },
      ]);

      const invariants = buildInvariantsFromFindings(findings, "test-run", "/test/repo");

      expect(invariants.invariants[0].rationale).toBeDefined();
      expect(invariants.invariants[0].rationale).toContain("Derived from");
      expect(invariants.invariants[0].sourceFindingIds).toContain("finding-test-001");
    });

    it("sets correct confidence from findings", () => {
      const findings = createFindings([
        {
          id: "finding-test-001",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.95,
          title: "Price issue",
          summary: "Price trusted from client",
          evidence: createEvidence("src/order.ts", 10),
          tags: ["payment"],
        },
      ]);

      const invariants = buildInvariantsFromFindings(findings, "test-run", "/test/repo");

      expect(invariants.invariants[0].confidence).toBe(0.95);
    });
  });

  describe("writeInvariantsJson", () => {
    it("writes invariants.json to output directory", () => {
      const findings = createFindings([
        {
          id: "finding-test-001",
          ruleId: "WEAK_AUTH_GUARD",
          category: "auth",
          severity: "critical",
          confidence: 0.9,
          title: "Auth issue",
          summary: "Auth guard issue",
          evidence: createEvidence("src/auth.ts", 10),
          tags: ["auth"],
        },
      ]);

      const invariants = buildInvariantsFromFindings(findings, "test-run", "/test/repo");
      const outputPath = writeInvariantsJson(TEMP_DIR, invariants);

      expect(existsSync(outputPath)).toBe(true);
      expect(outputPath.endsWith("invariants.json")).toBe(true);

      const content = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(content.artifact).toBe("invariants");
      expect(content.invariants.length).toBeGreaterThan(0);
    });

    it("produces valid JSON with correct structure", () => {
      const findings = createFindings([
        {
          id: "finding-test-001",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.85,
          title: "Price manipulation",
          summary: "Price trusted",
          evidence: createEvidence("src/price.ts", 5),
          tags: ["payment"],
        },
      ]);

      const invariants = buildInvariantsFromFindings(findings, "test-run", "/test/repo");
      writeInvariantsJson(TEMP_DIR, invariants);

      const content = JSON.parse(readFileSync(path.join(TEMP_DIR, "invariants.json"), "utf8"));

      expect(content.version).toBe("ctg/v1");
      expect(content.generated_at).toBeDefined();
      expect(content.run_id).toBe("test-run");
      expect(content.repo.root).toBe("/test/repo");
      expect(content.tool.name).toBe("code-to-gate");
    });
  });
});