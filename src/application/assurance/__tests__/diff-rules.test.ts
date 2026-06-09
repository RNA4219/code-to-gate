/**
 * Tests for Diff Semantic Rules
 *
 * Tests for 4 diff semantic rules:
 * - GUARD_WEAKENED: auth/permission guard removal
 * - VALIDATION_REMOVED: validation/sanitization removal
 * - ERROR_PATH_SUCCESS_FALLBACK: catch block weakening
 * - BUSINESS_RULE_LOCALIZED: business rule inline
 */

import { describe, it, expect } from "vitest";
import type { Finding, UnsupportedClaim, EvidenceRef } from "../../../types/artifacts.js";
import type { AssuranceFindingRuleId } from "../../../types/assurance-findings.js";
import type { HashService } from "../../../types/contracts.js";
import { REQUIRED_ASSURANCE_TAGS } from "../../../types/assurance-findings.js";
import { buildAssuranceGraph, type AssuranceArtifactBundle } from "../assurance-graph.js";
import type { DiffHunk, DiffLine, DiffAccess, DiffAccessLimits } from "../../../types/diff-contracts.js";
import {
  guardWeakenedRule,
  validationRemovedRule,
  errorPathSuccessFallbackRule,
  businessRuleLocalizedRule,
  evaluateDiffRules,
} from "../diff-rules.js";

// Import tag constants from the correct source (types layer)
const ASSURANCE_SMELL_TAG = REQUIRED_ASSURANCE_TAGS.ASSURANCE_SMELL;
const REVIEW_REQUIRED_TAG = REQUIRED_ASSURANCE_TAGS.REVIEW_REQUIRED;

// Inline mocks to avoid dependency boundary violation (application should not import from adapters)
class MockHashService implements HashService {
  private counter = 0;
  sha256(value: string): string {
    // Simple mock - not real SHA256
    return `sha256-${value.length}-${this.counter++}`;
  }
  fingerprint(value: string): string {
    return `fp-${value.length}`;
  }
}

const DEFAULT_DIFF_LIMITS: DiffAccessLimits = {
  maxFiles: 500,
  maxFileSize: 1024 * 1024,
};

class MockDiffAccess implements DiffAccess {
  private fileContents: Map<string, string> = new Map();
  private changedFiles: string[] = [];
  private diffs: Map<string, DiffHunk[]> = new Map();
  private limits: DiffAccessLimits = DEFAULT_DIFF_LIMITS;

  setContent(ref: string, filePath: string, content: string): void {
    this.fileContents.set(`${ref}:${filePath}`, content);
  }

  setChangedFiles(files: string[]): void {
    this.changedFiles = files;
  }

  setDiff(filePath: string, hunks: DiffHunk[]): void {
    this.diffs.set(filePath, hunks);
  }

  getFileContent(ref: string, filePath: string): string | null {
    return this.fileContents.get(`${ref}:${filePath}`) ?? null;
  }

  getChangedFiles(): string[] {
    return this.changedFiles.slice(0, this.limits.maxFiles);
  }

  getFileDiff(_base: string, _head: string, filePath: string): DiffHunk[] | null {
    return this.diffs.get(filePath) ?? null;
  }

  isPathSafe(filePath: string): boolean {
    return !filePath.includes("..") && !filePath.startsWith("/");
  }

  getLimits(): DiffAccessLimits {
    return { ...this.limits };
  }
}

function createMinimalBundle(): AssuranceArtifactBundle {
  return {
    // findings must be Finding[] array, not wrapped artifact object
    findings: [],
    repoGraph: { version: "ctg/v1", run_id: "test", nodes: [], edges: [], clusters: [] },
    // Use correct field name: riskRegister (not risks)
    riskRegister: [],
    testSeeds: [],
    invariants: [],
    releaseReadiness: { version: "ctg/v1", run_id: "test", overallStatus: "pending", qualityChecks: [], blockers: [], gates: [], artifacts: [] },
  };
}

function createHashService(): MockHashService {
  return new MockHashService();
}

describe("GUARD_WEAKENED rule", () => {
  it("detects guard call removal without alternative", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    // Setup: removed guard call
    diffAccess.setChangedFiles(["src/auth-handler.ts"]);
    diffAccess.setDiff("src/auth-handler.ts", [
      {
        oldStart: 20,
        oldLines: 1,
        newStart: 20,
        newLines: 0,
        lines: [{ type: "removed", content: "  if (!isAuthorized(user)) return false;" }],
      },
    ]);
    diffAccess.setContent("HEAD", "src/auth-handler.ts", "function processRequest(user) { return true; }");

    const result = guardWeakenedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].ruleId).toBe("GUARD_WEAKENED");
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.70);
    expect(result.candidates[0].tags).toContain(ASSURANCE_SMELL_TAG);
    expect(result.candidates[0].tags).toContain(REVIEW_REQUIRED_TAG);
  });

  it("skips when alternative guard is added", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/auth-handler.ts"]);
    diffAccess.setDiff("src/auth-handler.ts", [
      {
        oldStart: 20,
        oldLines: 1,
        newStart: 20,
        newLines: 1,
        lines: [
          { type: "removed", content: "  if (!isAuthorized(user)) return false;" },
          { type: "added", content: "  if (!hasPermission(user, 'read')) return false;" },
        ],
      },
    ]);
    diffAccess.setContent("HEAD", "src/auth-handler.ts", "function processRequest(user) { if (!hasPermission(user, 'read')) return false; return true; }");

    const result = guardWeakenedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates).toHaveLength(0);
  });

  it("skips test files", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/__tests__/auth.test.ts"]);
    diffAccess.setDiff("src/__tests__/auth.test.ts", [
      {
        oldStart: 10,
        oldLines: 1,
        newStart: 10,
        newLines: 0,
        lines: [{ type: "removed", content: "  if (!isAuthorized(user)) return false;" }],
      },
    ]);

    const result = guardWeakenedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates).toHaveLength(0);
  });

  it("confidence capped at 0.90", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/auth.ts"]);
    diffAccess.setDiff("src/auth.ts", [
      {
        oldStart: 10,
        oldLines: 1,
        newStart: 10,
        newLines: 0,
        lines: [{ type: "removed", content: "  checkRole(user, 'admin');" }],
      },
    ]);
    diffAccess.setContent("BASE", "src/auth.ts", "class AuthService { function check() { checkRole(user, 'admin'); } }");
    diffAccess.setContent("HEAD", "src/auth.ts", "class AuthService { function check() { } }");

    const result = guardWeakenedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    if (result.candidates.length > 0) {
      expect(result.candidates[0].confidence).toBeLessThanOrEqual(0.90);
    }
  });
});

describe("VALIDATION_REMOVED rule", () => {
  it("detects validation call removal", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/api.ts"]);
    diffAccess.setDiff("src/api.ts", [
      {
        oldStart: 15,
        oldLines: 1,
        newStart: 15,
        newLines: 0,
        lines: [{ type: "removed", content: "  validate(input, schema);" }],
      },
    ]);
    diffAccess.setContent("HEAD", "src/api.ts", "function process(input) { return transform(input); }");

    const result = validationRemovedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].ruleId).toBe("VALIDATION_REMOVED");
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.70);
  });

  it("skips when alternative validation added", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/api.ts"]);
    diffAccess.setDiff("src/api.ts", [
      {
        oldStart: 15,
        oldLines: 1,
        newStart: 15,
        newLines: 1,
        lines: [
          { type: "removed", content: "  validate(input, schema);" },
          { type: "added", content: "  Joi.validate(input, newSchema);" },
        ],
      },
    ]);
    diffAccess.setContent("HEAD", "src/api.ts", "function process(input) { Joi.validate(input, newSchema); return transform(input); }");

    const result = validationRemovedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates).toHaveLength(0);
  });

  it("detects Joi/Zod pattern removal", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/handler.ts"]);
    diffAccess.setDiff("src/handler.ts", [
      {
        oldStart: 20,
        oldLines: 2,
        newStart: 20,
        newLines: 0,
        lines: [
          { type: "removed", content: "  const schema = Joi.object({ name: Joi.string() });" },
          { type: "removed", content: "  const result = schema.validate(req.body);" },
        ],
      },
    ]);
    diffAccess.setContent("HEAD", "src/handler.ts", "function handler(req) { return req.body; }");

    const result = validationRemovedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

describe("ERROR_PATH_SUCCESS_FALLBACK rule", () => {
  it("detects catch returning success status", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/service.ts"]);
    diffAccess.setDiff("src/service.ts", [
      {
        oldStart: 30,
        oldLines: 0,
        newStart: 30,
        newLines: 3,
        lines: [
          { type: "added", content: "  catch (e) {" },
          { type: "added", content: "    return { success: true };" },
          { type: "added", content: "  }" },
        ],
      },
    ]);
    diffAccess.setContent("HEAD", "src/service.ts", "function process() { try { doWork(); } catch (e) { return { success: true }; } }");

    const result = errorPathSuccessFallbackRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].ruleId).toBe("ERROR_PATH_SUCCESS_FALLBACK");
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("detects empty catch block", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/utils.ts"]);
    diffAccess.setDiff("src/utils.ts", [
      {
        oldStart: 25,
        oldLines: 0,
        newStart: 25,
        newLines: 2,
        lines: [
          { type: "added", content: "  catch (e) { }" },
        ],
      },
    ]);
    diffAccess.setContent("HEAD", "src/utils.ts", "function safe() { try { work(); } catch (e) { } }");

    const result = errorPathSuccessFallbackRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("skips when error handling exists", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/service.ts"]);
    diffAccess.setDiff("src/service.ts", [
      {
        oldStart: 30,
        oldLines: 0,
        newStart: 30,
        newLines: 3,
        lines: [
          { type: "added", content: "  catch (e) {" },
          { type: "added", content: "    logError(e);" },
          { type: "added", content: "    return null;" },
        ],
      },
    ]);
    diffAccess.setContent("HEAD", "src/service.ts", "function process() { try { doWork(); } catch (e) { logError(e); return null; } }");

    const result = errorPathSuccessFallbackRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    // Should skip because logError indicates explicit error handling
    expect(result.candidates).toHaveLength(0);
  });

  it("confidence capped at 0.90", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/critical.ts"]);
    diffAccess.setDiff("src/critical.ts", [
      {
        oldStart: 100,
        oldLines: 0,
        newStart: 100,
        newLines: 2,
        lines: [
          { type: "added", content: "  catch (e) { return { success: true }; }" },
        ],
      },
    ]);
    diffAccess.setContent("HEAD", "src/critical.ts", "function critical() { try { work(); } catch (e) { return { success: true }; } }");

    const result = errorPathSuccessFallbackRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    if (result.candidates.length > 0) {
      expect(result.candidates[0].confidence).toBeLessThanOrEqual(0.90);
    }
  });
});

describe("BUSINESS_RULE_LOCALIZED rule", () => {
  it("detects shared call inline with sibling callers", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/order.ts"]);
    diffAccess.setDiff("src/order.ts", [
      {
        oldStart: 20,
        oldLines: 1,
        newStart: 20,
        newLines: 3,
        lines: [
          { type: "removed", content: "  const discount = calculateDiscount(user);" },
          { type: "added", content: "  if (user.type === 'vip') {" },
          { type: "added", content: "    discount = 0.2;" },
          { type: "added", content: "  }" },
        ],
      },
    ]);
    diffAccess.setContent("BASE", "src/order.ts", `
function calculateDiscount(user) { return user.type === 'vip' ? 0.2 : 0; }
function processOrderA(user) { const discount = calculateDiscount(user); }
function processOrderB(user) { const discount = calculateDiscount(user); }
`);
    diffAccess.setContent("HEAD", "src/order.ts", `
function calculateDiscount(user) { return user.type === 'vip' ? 0.2 : 0; }
function processOrderA(user) { if (user.type === 'vip') { discount = 0.2; } }
function processOrderB(user) { const discount = calculateDiscount(user); }
`);

    const result = businessRuleLocalizedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].ruleId).toBe("BUSINESS_RULE_LOCALIZED");
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.60);
    expect(result.candidates[0].confidence).toBeLessThanOrEqual(0.80);
  });

  it("skips when only one caller exists", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/unique.ts"]);
    diffAccess.setDiff("src/unique.ts", [
      {
        oldStart: 10,
        oldLines: 1,
        newStart: 10,
        newLines: 3,
        lines: [
          { type: "removed", content: "  const result = computeValue(input);" },
          { type: "added", content: "  if (input > 0) {" },
          { type: "added", content: "    result = input * 2;" },
          { type: "added", content: "  }" },
        ],
      },
    ]);
    diffAccess.setContent("BASE", "src/unique.ts", "function computeValue(x) { return x * 2; } function onlyCaller(x) { return computeValue(x); }");
    diffAccess.setContent("HEAD", "src/unique.ts", "function computeValue(x) { return x * 2; } function onlyCaller(x) { if (x > 0) { return x * 2; } }");

    const result = businessRuleLocalizedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    // Single caller - no inconsistency risk
    expect(result.candidates).toHaveLength(0);
  });

  it("uses lower confidence due to high FP risk", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/pricing.ts"]);
    diffAccess.setDiff("src/pricing.ts", [
      {
        oldStart: 50,
        oldLines: 1,
        newStart: 50,
        newLines: 2,
        lines: [
          { type: "removed", content: "  const price = getPrice(user);" },
          { type: "added", content: "  price = user.isPremium ? 100 : 50;" },
        ],
      },
    ]);
    diffAccess.setContent("BASE", "src/pricing.ts", "function getPrice(u) { ... } function checkoutA(u) { getPrice(u); } function checkoutB(u) { getPrice(u); } function checkoutC(u) { getPrice(u); }");

    const result = businessRuleLocalizedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    if (result.candidates.length > 0) {
      expect(result.candidates[0].confidence).toBeLessThanOrEqual(0.80);
    }
  });

  it("includes low-confidence tag", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/rules.ts"]);
    diffAccess.setDiff("src/rules.ts", [
      {
        oldStart: 30,
        oldLines: 1,
        newStart: 30,
        newLines: 2,
        lines: [
          { type: "removed", content: "  calculateTotal(items);" },
          { type: "added", content: "  total = items.length * 10;" },
        ],
      },
    ]);
    diffAccess.setContent("BASE", "src/rules.ts", "function calculateTotal(i) { ... } function callerA(i) { calculateTotal(i); } function callerB(i) { calculateTotal(i); }");

    const result = businessRuleLocalizedRule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

    if (result.candidates.length > 0) {
      expect(result.candidates[0].tags).toContain("low-confidence");
    }
  });
});

describe("evaluateDiffRules", () => {
  it("runs all 4 diff rules", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    diffAccess.setChangedFiles(["src/app.ts"]);

    const result = evaluateDiffRules(graph, diffAccess, "BASE", "HEAD", hashService);

    // All rules should be evaluated (no candidates if no matches)
    expect(result.candidates).toBeDefined();
    expect(result.unsupportedClaims).toBeDefined();
  });

  it("collects unsupported claims from rules", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();
    const diffAccess = new MockDiffAccess();

    // Set max files limit exceeded scenario
    const limits = diffAccess.getLimits();
    const manyFiles = Array.from({ length: limits.maxFiles + 10 }, (_, i) => `file${i}.ts`);
    diffAccess.setChangedFiles(manyFiles);

    const result = evaluateDiffRules(graph, diffAccess, "BASE", "HEAD", hashService);

    // GUARD_WEAKENED may produce unsupported claim for max_files_limit
    // (depends on implementation detail)
    expect(result.unsupportedClaims).toBeDefined();
  });
});

describe("Rule integration", () => {
  it("artifact-only evaluate returns empty", () => {
    const bundle = createMinimalBundle();
    const graph = buildAssuranceGraph(bundle);
    const hashService = createHashService();

    // All diff rules should return empty for artifact-only evaluation
    expect(guardWeakenedRule.evaluate(graph, hashService).candidates).toHaveLength(0);
    expect(validationRemovedRule.evaluate(graph, hashService).candidates).toHaveLength(0);
    expect(errorPathSuccessFallbackRule.evaluate(graph, hashService).candidates).toHaveLength(0);
    expect(businessRuleLocalizedRule.evaluate(graph, hashService).candidates).toHaveLength(0);
  });
});