/**
 * Tests for suppression-loader.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  parseSuppressionYaml,
  loadSuppressions,
  DEFAULT_SUPPRESSION_FILE,
} from "../suppression-loader.js";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

describe("suppression-loader", () => {
  let tempTestDir: string;

  beforeAll(() => {
    tempTestDir = path.join(tmpdir(), `ctg-suppression-loader-test-${Date.now()}`);
    mkdirSync(tempTestDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  describe("parseSuppressionYaml", () => {
    it("parses version field", () => {
      const yaml = "version: ctg/v1alpha1";
      const result = parseSuppressionYaml(yaml);
      expect(result.version).toBe("ctg/v1alpha1");
    });

    it("uses default version when not specified", () => {
      const yaml = "suppressions:\n  - rule_id: TEST_RULE\n    path: src/*.ts\n    reason: test";
      const result = parseSuppressionYaml(yaml);
      expect(result.version).toBe("ctg/v1alpha1");
    });

    it("parses single suppression entry", () => {
      const yaml = `
version: ctg/v1alpha1
suppressions:
  - rule_id: CLIENT_TRUSTED_PRICE
    path: "src/api/order/legacy-*.ts"
    reason: "Legacy code, migration planned"
    expiry: "2026-06-30"
    author: "tech-lead"
`;
      const result = parseSuppressionYaml(yaml);
      expect(result.suppressions).toHaveLength(1);
      expect(result.suppressions[0].rule_id).toBe("CLIENT_TRUSTED_PRICE");
      expect(result.suppressions[0].path).toBe("src/api/order/legacy-*.ts");
      expect(result.suppressions[0].reason).toBe("Legacy code, migration planned");
      expect(result.suppressions[0].expiry).toBe("2026-06-30");
      expect(result.suppressions[0].author).toBe("tech-lead");
    });

    it("parses multiple suppression entries", () => {
      const yaml = `
version: ctg/v1alpha1
suppressions:
  - rule_id: CLIENT_TRUSTED_PRICE
    path: "src/api/order/legacy-*.ts"
    reason: "Legacy code, migration planned"
    expiry: "2026-06-30"
    author: "tech-lead"

  - rule_id: WEAK_AUTH_GUARD
    path: "src/routes/public.ts"
    reason: "Public route, no auth required"
    expiry: "2027-01-01"
`;
      const result = parseSuppressionYaml(yaml);
      expect(result.suppressions).toHaveLength(2);
      expect(result.suppressions[0].rule_id).toBe("CLIENT_TRUSTED_PRICE");
      expect(result.suppressions[1].rule_id).toBe("WEAK_AUTH_GUARD");
    });

    it("handles unquoted paths", () => {
      const yaml = `
suppressions:
  - rule_id: TEST_RULE
    path: src/**/*.ts
    reason: test reason
`;
      const result = parseSuppressionYaml(yaml);
      expect(result.suppressions[0].path).toBe("src/**/*.ts");
    });

    it("handles suppressions without optional fields", () => {
      const yaml = `
suppressions:
  - rule_id: TEST_RULE
    path: src/*.ts
    reason: basic reason
`;
      const result = parseSuppressionYaml(yaml);
      expect(result.suppressions[0].expiry).toBeUndefined();
      expect(result.suppressions[0].author).toBeUndefined();
    });

    it("ignores comments", () => {
      const yaml = `
# This is a comment
version: ctg/v1alpha1
# Another comment
suppressions:
  # Comment in block
  - rule_id: TEST_RULE
    path: src/*.ts
    reason: test
`;
      const result = parseSuppressionYaml(yaml);
      expect(result.version).toBe("ctg/v1alpha1");
      expect(result.suppressions).toHaveLength(1);
    });

    it("returns empty suppressions array for no suppressions block", () => {
      const yaml = "version: ctg/v1alpha1";
      const result = parseSuppressionYaml(yaml);
      expect(result.suppressions).toEqual([]);
    });

    it("handles empty suppressions block", () => {
      const yaml = `
version: ctg/v1alpha1
suppressions:
`;
      const result = parseSuppressionYaml(yaml);
      expect(result.suppressions).toEqual([]);
    });

    it("skips incomplete suppression entries", () => {
      const yaml = `
suppressions:
  - rule_id: COMPLETE_RULE
    path: src/*.ts
    reason: complete

  - rule_id: INCOMPLETE_RULE
    # missing path and reason

  - rule_id: ANOTHER_COMPLETE
    path: test/*.ts
    reason: another
`;
      const result = parseSuppressionYaml(yaml);
      expect(result.suppressions).toHaveLength(2);
      expect(result.suppressions[0].rule_id).toBe("COMPLETE_RULE");
      expect(result.suppressions[1].rule_id).toBe("ANOTHER_COMPLETE");
    });
  });

  describe("loadSuppressions", () => {
    it("returns undefined when path is undefined and default file not found", () => {
      const result = loadSuppressions(undefined, tempTestDir);
      expect(result).toBeUndefined();
    });

    it("returns undefined for non-existent file", () => {
      const result = loadSuppressions("nonexistent.yaml", tempTestDir);
      expect(result).toBeUndefined();
    });

    it("loads suppression file from specified path", () => {
      const suppressionPath = path.join(tempTestDir, "test-suppressions.yaml");
      writeFileSync(suppressionPath, `
version: ctg/v1alpha1
suppressions:
  - rule_id: TEST_RULE
    path: src/*.ts
    reason: test reason
`, "utf8");

      const result = loadSuppressions("test-suppressions.yaml", tempTestDir);
      expect(result?.version).toBe("ctg/v1alpha1");
      expect(result?.suppressions).toHaveLength(1);
      expect(result?.suppressions[0].rule_id).toBe("TEST_RULE");
    });

    it("uses policy-specified path over default", () => {
      const defaultPath = path.join(tempTestDir, DEFAULT_SUPPRESSION_FILE);
      mkdirSync(path.dirname(defaultPath), { recursive: true });
      writeFileSync(defaultPath, `
suppressions:
  - rule_id: DEFAULT_RULE
    path: default/*.ts
    reason: default
`, "utf8");

      const policyPath = path.join(tempTestDir, "policy-suppressions.yaml");
      writeFileSync(policyPath, `
suppressions:
  - rule_id: POLICY_RULE
    path: policy/*.ts
    reason: policy
`, "utf8");

      const result = loadSuppressions(undefined, tempTestDir, "policy-suppressions.yaml");
      expect(result?.suppressions[0].rule_id).toBe("POLICY_RULE");
    });

    it("handles absolute paths", () => {
      const absolutePath = path.join(tempTestDir, "absolute-suppressions.yaml");
      writeFileSync(absolutePath, `
suppressions:
  - rule_id: ABSOLUTE_RULE
    path: absolute/*.ts
    reason: absolute
`, "utf8");

      const result = loadSuppressions(absolutePath, tempTestDir);
      expect(result?.suppressions[0].rule_id).toBe("ABSOLUTE_RULE");
    });

    it("loads from .ctg/suppressions.yaml by default", () => {
      const ctgDir = path.join(tempTestDir, ".ctg");
      mkdirSync(ctgDir, { recursive: true });
      const defaultFile = path.join(ctgDir, "suppressions.yaml");
      writeFileSync(defaultFile, `
version: ctg/v1alpha1
suppressions:
  - rule_id: DEFAULT_LOCATION_RULE
    path: src/*.ts
    reason: default location
`, "utf8");

      const result = loadSuppressions(undefined, tempTestDir);
      expect(result?.suppressions[0].rule_id).toBe("DEFAULT_LOCATION_RULE");
    });
  });

  describe("DEFAULT_SUPPRESSION_FILE", () => {
    it("is set to .ctg/suppressions.yaml", () => {
      expect(DEFAULT_SUPPRESSION_FILE).toBe(".ctg/suppressions.yaml");
    });
  });
});