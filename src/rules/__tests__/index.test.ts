/**
 * Tests for rules/index.ts - rule utilities and exports
 */

import { describe, it, expect } from "vitest";
import {
  hashExcerpt,
  generateFindingId,
  createEvidence,
  type RulePlugin,
  type RuleContext,
  type SimpleGraph,
} from "../index.js";
import type { Finding, EvidenceRef, RepoFile } from "../../types/artifacts.js";

// Import all rules to test exports
import { CLIENT_TRUSTED_PRICE_RULE } from "../client-trusted-price.js";
import { WEAK_AUTH_GUARD_RULE } from "../weak-auth-guard.js";
import { TRY_CATCH_SWALLOW_RULE } from "../try-catch-swallow.js";
import { MISSING_SERVER_VALIDATION_RULE } from "../missing-server-validation.js";
import { UNTESTED_CRITICAL_PATH_RULE } from "../untested-critical-path.js";

describe("rule utilities", () => {
  describe("hashExcerpt", () => {
    it("should generate consistent hash for same input", () => {
      const text = "req.body.total";
      const hash1 = hashExcerpt(text);
      const hash2 = hashExcerpt(text);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{8}$/);
    });

    it("should generate different hashes for different inputs", () => {
      const hash1 = hashExcerpt("req.body.total");
      const hash2 = hashExcerpt("req.body.price");

      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty string", () => {
      const hash = hashExcerpt("");

      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe("generateFindingId", () => {
    it("should generate unique finding ID with line number", () => {
      const id = generateFindingId("CLIENT_TRUSTED_PRICE", "src/api/order.ts", 42);

      expect(id).toContain("CLIENT_TRUSTED_PRICE");
      expect(id).toContain("L42");
      expect(id).toMatch(/^finding:/);
    });

    it("should generate unique finding ID without line number", () => {
      const id = generateFindingId("WEAK_AUTH_GUARD", "src/auth/guard.ts");

      expect(id).toContain("WEAK_AUTH_GUARD");
      expect(id).toMatch(/^finding:/);
      expect(id).not.toContain("L");
    });

    it("should generate consistent IDs for same inputs", () => {
      const id1 = generateFindingId("TRY_CATCH_SWALLOW", "src/log.ts", 10);
      const id2 = generateFindingId("TRY_CATCH_SWALLOW", "src/log.ts", 10);

      expect(id1).toBe(id2);
    });
  });

  describe("createEvidence", () => {
    it("should create evidence with excerpt hash for text kind", () => {
      const excerpt = "req.body.total = 100";
      const evidence = createEvidence("src/api.ts", 10, 15, "text", excerpt);

      expect(evidence.id).toContain("evidence:");
      expect(evidence.path).toBe("src/api.ts");
      expect(evidence.startLine).toBe(10);
      expect(evidence.endLine).toBe(15);
      expect(evidence.kind).toBe("text");
      expect(evidence.excerptHash).toBeDefined();
      expect(evidence.excerptHash).toBe(hashExcerpt(excerpt));
    });

    it("should create evidence without excerpt hash for non-text kinds", () => {
      const evidence = createEvidence("src/api.ts", 1, 5, "import");

      expect(evidence.kind).toBe("import");
      expect(evidence.excerptHash).toBeUndefined();
    });

    it("should handle all evidence kinds", () => {
      const kinds: EvidenceRef["kind"][] = [
        "ast",
        "text",
        "import",
        "external",
        "test",
        "coverage",
        "diff",
      ];

      for (const kind of kinds) {
        const evidence = createEvidence("src/test.ts", 1, 2, kind);
        expect(evidence.kind).toBe(kind);
      }
    });
  });
});

describe("rule plugins interface", () => {
  const allRules: RulePlugin[] = [
    CLIENT_TRUSTED_PRICE_RULE,
    WEAK_AUTH_GUARD_RULE,
    TRY_CATCH_SWALLOW_RULE,
    MISSING_SERVER_VALIDATION_RULE,
    UNTESTED_CRITICAL_PATH_RULE,
  ];

  it("should have all required rule properties", () => {
    for (const rule of allRules) {
      expect(rule.id).toBeDefined();
      expect(rule.id).toMatch(/^[A-Z_]+$/);
      expect(rule.name).toBeDefined();
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.description).toBeDefined();
      expect(rule.description.length).toBeGreaterThan(10);
      expect(rule.category).toBeDefined();
      expect(rule.defaultSeverity).toBeDefined();
      expect(rule.defaultConfidence).toBeGreaterThan(0);
      expect(rule.defaultConfidence).toBeLessThanOrEqual(1);
      expect(rule.evaluate).toBeDefined();
      expect(typeof rule.evaluate).toBe("function");
    }
  });

  it("should have unique rule IDs", () => {
    const ids = allRules.map((r) => r.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have valid categories", () => {
    const validCategories: Finding["category"][] = [
      "auth",
      "payment",
      "validation",
      "data",
      "config",
      "maintainability",
      "testing",
      "compatibility",
      "release-risk",
    ];

    for (const rule of allRules) {
      expect(validCategories).toContain(rule.category);
    }
  });

  it("should have valid severities", () => {
    const validSeverities: Finding["severity"][] = [
      "low",
      "medium",
      "high",
      "critical",
    ];

    for (const rule of allRules) {
      expect(validSeverities).toContain(rule.defaultSeverity);
    }
  });

  it("CLIENT_TRUSTED_PRICE should have critical severity for payment category", () => {
    expect(CLIENT_TRUSTED_PRICE_RULE.id).toBe("CLIENT_TRUSTED_PRICE");
    expect(CLIENT_TRUSTED_PRICE_RULE.category).toBe("payment");
    expect(CLIENT_TRUSTED_PRICE_RULE.defaultSeverity).toBe("critical");
  });

  it("WEAK_AUTH_GUARD should have critical severity for auth category", () => {
    expect(WEAK_AUTH_GUARD_RULE.id).toBe("WEAK_AUTH_GUARD");
    expect(WEAK_AUTH_GUARD_RULE.category).toBe("auth");
    expect(WEAK_AUTH_GUARD_RULE.defaultSeverity).toBe("critical");
  });

  it("TRY_CATCH_SWALLOW should have medium severity for maintainability category", () => {
    expect(TRY_CATCH_SWALLOW_RULE.id).toBe("TRY_CATCH_SWALLOW");
    expect(TRY_CATCH_SWALLOW_RULE.category).toBe("maintainability");
    expect(TRY_CATCH_SWALLOW_RULE.defaultSeverity).toBe("medium");
  });

  it("MISSING_SERVER_VALIDATION should have critical severity for validation category", () => {
    expect(MISSING_SERVER_VALIDATION_RULE.id).toBe("MISSING_SERVER_VALIDATION");
    expect(MISSING_SERVER_VALIDATION_RULE.category).toBe("validation");
    expect(MISSING_SERVER_VALIDATION_RULE.defaultSeverity).toBe("critical");
  });

  it("UNTESTED_CRITICAL_PATH should have high severity for testing category", () => {
    expect(UNTESTED_CRITICAL_PATH_RULE.id).toBe("UNTESTED_CRITICAL_PATH");
    expect(UNTESTED_CRITICAL_PATH_RULE.category).toBe("testing");
    expect(UNTESTED_CRITICAL_PATH_RULE.defaultSeverity).toBe("high");
  });
});

describe("RuleContext interface", () => {
  it("should work with minimal context", () => {
    const minimalContext: RuleContext = {
      graph: {
        files: [],
        run_id: "test",
        generated_at: "2026-04-29T00:00:00Z",
        repo: { root: "/test" },
        stats: { partial: false },
      },
      getFileContent: () => null,
    };

    // All rules should handle empty files array gracefully
    for (const rule of [
      CLIENT_TRUSTED_PRICE_RULE,
      WEAK_AUTH_GUARD_RULE,
      TRY_CATCH_SWALLOW_RULE,
      MISSING_SERVER_VALIDATION_RULE,
      UNTESTED_CRITICAL_PATH_RULE,
    ]) {
      const findings = rule.evaluate(minimalContext);
      expect(findings).toBeInstanceOf(Array);
      expect(findings.length).toBe(0);
    }
  });
});

describe("SimpleGraph interface", () => {
  it("should support partial stats flag", () => {
    const partialGraph: SimpleGraph = {
      files: [],
      run_id: "test",
      generated_at: "2026-04-29T00:00:00Z",
      repo: { root: "/test" },
      stats: { partial: true },
    };

    expect(partialGraph.stats.partial).toBe(true);
  });

  it("should support repo root with optional fields", () => {
    const graph: SimpleGraph = {
      files: [],
      run_id: "test",
      generated_at: "2026-04-29T00:00:00Z",
      repo: {
        root: "/test",
        revision: "abc123",
        branch: "main",
        dirty: false,
      },
      stats: { partial: false },
    };

    expect(graph.repo.root).toBe("/test");
    expect(graph.repo.revision).toBe("abc123");
    expect(graph.repo.branch).toBe("main");
    expect(graph.repo.dirty).toBe(false);
  });
});