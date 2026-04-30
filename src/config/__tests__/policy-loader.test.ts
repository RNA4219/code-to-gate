/**
 * Tests for policy-loader.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createDefaultPolicy,
  loadPolicyFile,
  validatePolicy,
  isValidPolicyVersion,
  loadSuppressionFile,
  isSuppressed,
  POLICY_VERSION,
  type CtgPolicy,
  type SuppressionEntry,
} from "../policy-loader.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

describe("policy-loader", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = path.join(tmpdir(), `ctg-policy-loader-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("createDefaultPolicy", () => {
    it("should create default policy with correct version", () => {
      const policy = createDefaultPolicy();

      expect(policy.version).toBe(POLICY_VERSION);
      expect(policy.policyId).toBe("default-policy");
    });

    it("should have default blocking severity config", () => {
      const policy = createDefaultPolicy();

      expect(policy.blocking.severity.critical).toBe(true);
      expect(policy.blocking.severity.high).toBe(true);
      expect(policy.blocking.severity.medium).toBe(false);
      expect(policy.blocking.severity.low).toBe(false);
    });

    it("should have default blocking category config", () => {
      const policy = createDefaultPolicy();

      expect(policy.blocking.category.auth).toBe(true);
      expect(policy.blocking.category.payment).toBe(true);
      expect(policy.blocking.category.validation).toBe(true);
      expect(policy.blocking.category.security).toBe(true);
      expect(policy.blocking.category.data).toBe(false);
    });

    it("should have default confidence config", () => {
      const policy = createDefaultPolicy();

      expect(policy.confidence.minConfidence).toBe(0.6);
      expect(policy.confidence.lowConfidenceThreshold).toBe(0.4);
      expect(policy.confidence.filterLow).toBe(true);
    });

    it("should have default count threshold config", () => {
      const policy = createDefaultPolicy();

      expect(policy.blocking.countThreshold?.criticalMax).toBe(0);
      expect(policy.blocking.countThreshold?.highMax).toBe(5);
      expect(policy.blocking.countThreshold?.mediumMax).toBe(20);
    });
  });

  describe("isValidPolicyVersion", () => {
    it("should accept valid version", () => {
      expect(isValidPolicyVersion("ctg/v1alpha1")).toBe(true);
    });

    it("should reject invalid versions", () => {
      expect(isValidPolicyVersion("v1")).toBe(false);
      expect(isValidPolicyVersion("ctg/v1")).toBe(false);
      expect(isValidPolicyVersion("1.0")).toBe(false);
      expect(isValidPolicyVersion("")).toBe(false);
    });
  });

  describe("validatePolicy", () => {
    it("should validate correct policy", () => {
      const policy = createDefaultPolicy();
      const result = validatePolicy(policy);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("should detect invalid version", () => {
      const policy: CtgPolicy = {
        ...createDefaultPolicy(),
        version: "invalid-version",
      };
      const result = validatePolicy(policy);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("version"))).toBe(true);
    });

    it("should detect missing policyId", () => {
      const policy: CtgPolicy = {
        ...createDefaultPolicy(),
        policyId: "",
      };
      const result = validatePolicy(policy);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("policy_id"))).toBe(true);
    });

    it("should detect invalid minConfidence range", () => {
      const policy: CtgPolicy = {
        ...createDefaultPolicy(),
        confidence: { minConfidence: 1.5 },
      };
      const result = validatePolicy(policy);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("min_confidence"))).toBe(true);
    });

    it("should detect negative minConfidence", () => {
      const policy: CtgPolicy = {
        ...createDefaultPolicy(),
        confidence: { minConfidence: -0.1 },
      };
      const result = validatePolicy(policy);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("min_confidence"))).toBe(true);
    });

    it("should validate LLM minConfidence if present", () => {
      const policy: CtgPolicy = {
        ...createDefaultPolicy(),
        llm: { minConfidence: 2.0 },
      };
      const result = validatePolicy(policy);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("LLM min_confidence"))).toBe(true);
    });
  });

  describe("loadPolicyFile", () => {
    it("should load valid policy file", () => {
      const policyPath = path.join(tempDir, "valid-policy.yaml");
      writeFileSync(policyPath, `
version: ctg/v1alpha1
policy_id: test-policy

blocking:
  severity:
    critical: true
    high: true
  category:
    auth: true
    payment: true

confidence:
  min_confidence: 0.7
`);

      const result = loadPolicyFile(policyPath, tempDir);

      expect(result.errors.length).toBe(0);
      expect(result.policy.policyId).toBe("test-policy");
      expect(result.policy.blocking.severity.critical).toBe(true);
      expect(result.policy.blocking.category.auth).toBe(true);
      expect(result.policy.confidence.minConfidence).toBe(0.7);
    });

    it("should return errors for non-existent file", () => {
      const result = loadPolicyFile("non-existent.yaml", tempDir);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
      expect(result.policy.policyId).toBe("default-policy");
    });

    it("should parse rule blocking", () => {
      const policyPath = path.join(tempDir, "rule-policy.yaml");
      writeFileSync(policyPath, `
version: ctg/v1alpha1
policy_id: rule-blocking-test

blocking:
  severity:
    critical: true
    high: true
  category:
    auth: true
  rules:
    CLIENT_TRUSTED_PRICE: true
    WEAK_AUTH_GUARD: true
`);

      const result = loadPolicyFile(policyPath, tempDir);

      expect(result.policy.blocking.rules?.CLIENT_TRUSTED_PRICE).toBe(true);
      expect(result.policy.blocking.rules?.WEAK_AUTH_GUARD).toBe(true);
    });

    it("should parse count thresholds", () => {
      const policyPath = path.join(tempDir, "threshold-policy.yaml");
      writeFileSync(policyPath, `
version: ctg/v1alpha1
policy_id: threshold-test

blocking:
  severity:
    critical: true
  category:
    auth: true
  count_threshold:
    critical_max: 0
    high_max: 3
    medium_max: 10
`);

      const result = loadPolicyFile(policyPath, tempDir);

      expect(result.policy.blocking.countThreshold?.criticalMax).toBe(0);
      expect(result.policy.blocking.countThreshold?.highMax).toBe(3);
      expect(result.policy.blocking.countThreshold?.mediumMax).toBe(10);
    });

    it("should parse LLM config", () => {
      const policyPath = path.join(tempDir, "llm-policy.yaml");
      writeFileSync(policyPath, `
version: ctg/v1alpha1
policy_id: llm-test

llm:
  enabled: true
  mode: local-only
  min_confidence: 0.8
  require_llm: false
`);

      const result = loadPolicyFile(policyPath, tempDir);

      expect(result.policy.llm?.enabled).toBe(true);
      expect(result.policy.llm?.mode).toBe("local-only");
      expect(result.policy.llm?.minConfidence).toBe(0.8);
    });

    it("should parse suppression config", () => {
      const policyPath = path.join(tempDir, "suppression-policy.yaml");
      writeFileSync(policyPath, `
version: ctg/v1alpha1
policy_id: suppression-test

suppression:
  file: .ctg/suppressions.yaml
  expiry_warning_days: 14
  max_suppressions_per_rule: 5
`);

      const result = loadPolicyFile(policyPath, tempDir);

      expect(result.policy.suppression?.file).toBe(".ctg/suppressions.yaml");
      expect(result.policy.suppression?.expiryWarningDays).toBe(14);
      expect(result.policy.suppression?.maxSuppressionsPerRule).toBe(5);
    });

    it("should merge with defaults for missing fields", () => {
      const policyPath = path.join(tempDir, "minimal-policy.yaml");
      writeFileSync(policyPath, `
policy_id: minimal
`);

      const result = loadPolicyFile(policyPath, tempDir);

      expect(result.policy.policyId).toBe("minimal");
      // Should have default blocking config
      expect(result.policy.blocking.severity.critical).toBe(true);
      expect(result.policy.blocking.category.auth).toBe(true);
    });
  });

  describe("loadSuppressionFile", () => {
    it("should load valid suppression file", () => {
      const suppressionPath = path.join(tempDir, "suppressions.yaml");
      // Use format compatible with simple YAML parser
      writeFileSync(suppressionPath, `version: ctg/v1alpha1
suppressions:
  -
    rule_id: CLIENT_TRUSTED_PRICE
    path: src/cart.ts
    reason: Known issue
    expiry: 2025-12-31
    author: dev-team
  -
    rule_id: WEAK_AUTH_GUARD
    path: src/auth/*
    reason: Legacy code
`);

      const result = loadSuppressionFile(suppressionPath, tempDir);

      expect(result.version).toBe(POLICY_VERSION);
      expect(result.suppressions.length).toBe(2);
      expect(result.suppressions[0].ruleId).toBe("CLIENT_TRUSTED_PRICE");
      expect(result.suppressions[0].path).toBe("src/cart.ts");
      expect(result.suppressions[0].expiry).toBe("2025-12-31");
      expect(result.suppressions[1].ruleId).toBe("WEAK_AUTH_GUARD");
      expect(result.suppressions[1].path).toBe("src/auth/*");
    });

    it("should return empty suppressions for non-existent file", () => {
      const result = loadSuppressionFile("non-existent-suppressions.yaml", tempDir);

      expect(result.suppressions.length).toBe(0);
    });
  });

  describe("isSuppressed", () => {
    it("should suppress matching rule and path", () => {
      const suppressions: SuppressionEntry[] = [
        {
          ruleId: "CLIENT_TRUSTED_PRICE",
          path: "src/cart.ts",
          reason: "Known issue",
        },
      ];

      const result = isSuppressed("CLIENT_TRUSTED_PRICE", "src/cart.ts", suppressions);

      expect(result.suppressed).toBe(true);
      expect(result.reason).toBe("Known issue");
    });

    it("should not suppress non-matching rule", () => {
      const suppressions: SuppressionEntry[] = [
        {
          ruleId: "CLIENT_TRUSTED_PRICE",
          path: "src/cart.ts",
          reason: "Known issue",
        },
      ];

      const result = isSuppressed("WEAK_AUTH_GUARD", "src/cart.ts", suppressions);

      expect(result.suppressed).toBe(false);
    });

    it("should not suppress non-matching path", () => {
      const suppressions: SuppressionEntry[] = [
        {
          ruleId: "CLIENT_TRUSTED_PRICE",
          path: "src/cart.ts",
          reason: "Known issue",
        },
      ];

      const result = isSuppressed("CLIENT_TRUSTED_PRICE", "src/other.ts", suppressions);

      expect(result.suppressed).toBe(false);
    });

    it("should handle glob patterns", () => {
      const suppressions: SuppressionEntry[] = [
        {
          ruleId: "WEAK_AUTH_GUARD",
          path: "src/auth/*",
          reason: "Legacy code",
        },
      ];

      const result1 = isSuppressed("WEAK_AUTH_GUARD", "src/auth/login.ts", suppressions);
      const result2 = isSuppressed("WEAK_AUTH_GUARD", "src/auth/middleware.ts", suppressions);
      const result3 = isSuppressed("WEAK_AUTH_GUARD", "src/other.ts", suppressions);

      expect(result1.suppressed).toBe(true);
      expect(result2.suppressed).toBe(true);
      expect(result3.suppressed).toBe(false);
    });

    it("should respect expiry date", () => {
      const suppressions: SuppressionEntry[] = [
        {
          ruleId: "CLIENT_TRUSTED_PRICE",
          path: "src/cart.ts",
          reason: "Temporary",
          expiry: "2020-01-01", // Already expired
        },
      ];

      const result = isSuppressed("CLIENT_TRUSTED_PRICE", "src/cart.ts", suppressions);

      // Should not suppress because expiry is in the past
      expect(result.suppressed).toBe(false);
    });

    it("should suppress with future expiry date", () => {
      const suppressions: SuppressionEntry[] = [
        {
          ruleId: "CLIENT_TRUSTED_PRICE",
          path: "src/cart.ts",
          reason: "Active suppression",
          expiry: "2030-12-31", // Future date
        },
      ];

      const result = isSuppressed("CLIENT_TRUSTED_PRICE", "src/cart.ts", suppressions);

      expect(result.suppressed).toBe(true);
      expect(result.expiry).toBe("2030-12-31");
    });
  });

  describe("strict.yaml fixture validation", () => {
    it("should load fixtures/policies/strict.yaml correctly", () => {
      const fixturePath = "fixtures/policies/strict.yaml";
      if (existsSync(fixturePath)) {
        const result = loadPolicyFile(fixturePath, process.cwd());

        expect(result.errors.length).toBe(0);
        expect(result.policy.policyId).toBe("strict");
        expect(result.policy.blocking.severity.critical).toBe(true);
        expect(result.policy.blocking.severity.high).toBe(true);
        expect(result.policy.blocking.category.payment).toBe(true);
        expect(result.policy.blocking.category.auth).toBe(true);
        expect(result.policy.blocking.rules?.CLIENT_TRUSTED_PRICE).toBe(true);
        expect(result.policy.blocking.rules?.WEAK_AUTH_GUARD).toBe(true);
      } else {
        // Skip if fixture doesn't exist
        expect(true).toBe(true);
      }
    });
  });
});