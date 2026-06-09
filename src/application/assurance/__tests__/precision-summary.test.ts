/**
 * Precision Evaluation Summary Test
 *
 * Runs comprehensive precision evaluation for all diff rules
 * and computes FP rate. Target: <= 15% for Phase 1.
 *
 * Output: fp-evaluation-summary.json with detailed results
 */

import { describe, it, expect } from "vitest";
import type { HashService } from "../../types/contracts.js";
import type { DiffHunk, DiffAccess, DiffAccessLimits } from "../../types/diff-contracts.js";
import { buildAssuranceGraph, type AssuranceArtifactBundle } from "../assurance-graph.js";
import {
  guardWeakenedRule,
  validationRemovedRule,
  errorPathSuccessFallbackRule,
  businessRuleLocalizedRule,
} from "../diff-rules.js";
import {
  evaluateFP,
  type FindingReview,
} from "../../../evaluation/fp-evaluator.js";

// Inline mocks
class MockHashService implements HashService {
  private counter = 0;
  sha256(value: string): string { return `sha256-${value.length}-${this.counter++}`; }
  fingerprint(value: string): string { return `fp-${value.length}`; }
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
  setChangedFiles(files: string[]): void { this.changedFiles = files; }
  setDiff(filePath: string, hunks: DiffHunk[]): void { this.diffs.set(filePath, hunks); }
  getFileContent(ref: string, filePath: string): string | null {
    return this.fileContents.get(`${ref}:${filePath}`) ?? null;
  }
  getChangedFiles(): string[] { return this.changedFiles.slice(0, this.limits.maxFiles); }
  getFileDiff(_base: string, _head: string, filePath: string): DiffHunk[] | null {
    return this.diffs.get(filePath) ?? null;
  }
  isPathSafe(filePath: string): boolean { return !filePath.includes("..") && !filePath.startsWith("/"); }
  getLimits(): DiffAccessLimits { return { ...this.limits }; }
}

function createMinimalBundle(): AssuranceArtifactBundle {
  return {
    findings: [],
    repoGraph: { version: "ctg/v1", run_id: "test", nodes: [], edges: [], clusters: [] },
    riskRegister: [],
    testSeeds: [],
    invariants: [],
    releaseReadiness: { version: "ctg/v1", run_id: "test", overallStatus: "pending", qualityChecks: [], blockers: [], gates: [], artifacts: [] },
  };
}

interface TestCase {
  name: string;
  ruleId: "GUARD_WEAKENED" | "VALIDATION_REMOVED" | "ERROR_PATH_SUCCESS_FALLBACK" | "BUSINESS_RULE_LOCALIZED";
  expectedToDetect: boolean; // true = should find finding, false = should NOT find finding
  setup: (diffAccess: MockDiffAccess) => void;
}

const TEST_CASES: TestCase[] = [
  // === GUARD_WEAKENED ===
  {
    name: "GW_TP_01_guard_removal",
    ruleId: "GUARD_WEAKENED",
    expectedToDetect: true,
    setup: (d) => {
      d.setChangedFiles(["src/auth.ts"]);
      d.setDiff("src/auth.ts", [{ oldStart: 20, oldLines: 1, newStart: 20, newLines: 0, lines: [{ type: "removed", content: "  if (!isAuthorized(user)) return false;" }] }]);
      d.setContent("HEAD", "src/auth.ts", "function processRequest(user) { return true; }");
    },
  },
  {
    name: "GW_FP_01_alternative_guard",
    ruleId: "GUARD_WEAKENED",
    expectedToDetect: false,
    setup: (d) => {
      d.setChangedFiles(["src/auth.ts"]);
      d.setDiff("src/auth.ts", [{ oldStart: 20, oldLines: 1, newStart: 20, newLines: 1, lines: [
        { type: "removed", content: "  if (!isAuthorized(user)) return false;" },
        { type: "added", content: "  if (!hasPermission(user, 'read')) return false;" },
      ] }]);
      d.setContent("HEAD", "src/auth.ts", "function processRequest(user) { if (!hasPermission(user, 'read')) return false; return true; }");
    },
  },
  {
    name: "GW_FP_02_test_file",
    ruleId: "GUARD_WEAKENED",
    expectedToDetect: false,
    setup: (d) => {
      d.setChangedFiles(["src/__tests__/auth.test.ts"]);
      d.setDiff("src/__tests__/auth.test.ts", [{ oldStart: 10, oldLines: 1, newStart: 10, newLines: 0, lines: [{ type: "removed", content: "  if (!isAuthorized(user)) return false;" }] }]);
    },
  },

  // === VALIDATION_REMOVED ===
  {
    name: "VR_TP_01_validate_removal",
    ruleId: "VALIDATION_REMOVED",
    expectedToDetect: true,
    setup: (d) => {
      d.setChangedFiles(["src/api.ts"]);
      d.setDiff("src/api.ts", [{ oldStart: 15, oldLines: 1, newStart: 15, newLines: 0, lines: [{ type: "removed", content: "  validate(input, schema);" }] }]);
      d.setContent("HEAD", "src/api.ts", "function process(input) { return transform(input); }");
    },
  },
  {
    name: "VR_FP_01_alternative_validation",
    ruleId: "VALIDATION_REMOVED",
    expectedToDetect: false,
    setup: (d) => {
      d.setChangedFiles(["src/api.ts"]);
      d.setDiff("src/api.ts", [{ oldStart: 15, oldLines: 1, newStart: 15, newLines: 1, lines: [
        { type: "removed", content: "  validate(input, schema);" },
        { type: "added", content: "  Joi.validate(input, newSchema);" },
      ] }]);
      d.setContent("HEAD", "src/api.ts", "function process(input) { Joi.validate(input, newSchema); return transform(input); }");
    },
  },
  {
    name: "VR_TP_02_joi_pattern",
    ruleId: "VALIDATION_REMOVED",
    expectedToDetect: true,
    setup: (d) => {
      d.setChangedFiles(["src/handler.ts"]);
      d.setDiff("src/handler.ts", [{ oldStart: 20, oldLines: 2, newStart: 20, newLines: 0, lines: [
        { type: "removed", content: "  const schema = Joi.object({ name: Joi.string() });" },
        { type: "removed", content: "  const result = schema.validate(req.body);" },
      ] }]);
      d.setContent("HEAD", "src/handler.ts", "function handler(req) { return req.body; }");
    },
  },

  // === ERROR_PATH_SUCCESS_FALLBACK ===
  {
    name: "EP_TP_01_success_return",
    ruleId: "ERROR_PATH_SUCCESS_FALLBACK",
    expectedToDetect: true,
    setup: (d) => {
      d.setChangedFiles(["src/service.ts"]);
      d.setDiff("src/service.ts", [{ oldStart: 30, oldLines: 0, newStart: 30, newLines: 3, lines: [
        { type: "added", content: "  catch (e) {" },
        { type: "added", content: "    return { success: true };" },
        { type: "added", content: "  }" },
      ] }]);
      d.setContent("HEAD", "src/service.ts", "function process() { try { doWork(); } catch (e) { return { success: true }; } }");
    },
  },
  {
    name: "EP_TP_02_empty_catch",
    ruleId: "ERROR_PATH_SUCCESS_FALLBACK",
    expectedToDetect: true,
    setup: (d) => {
      d.setChangedFiles(["src/utils.ts"]);
      d.setDiff("src/utils.ts", [{ oldStart: 25, oldLines: 0, newStart: 25, newLines: 2, lines: [{ type: "added", content: "  catch (e) { }" }] }]);
      d.setContent("HEAD", "src/utils.ts", "function safe() { try { work(); } catch (e) { } }");
    },
  },
  {
    name: "EP_FP_01_error_handling",
    ruleId: "ERROR_PATH_SUCCESS_FALLBACK",
    expectedToDetect: false,
    setup: (d) => {
      d.setChangedFiles(["src/service.ts"]);
      d.setDiff("src/service.ts", [{ oldStart: 30, oldLines: 0, newStart: 30, newLines: 3, lines: [
        { type: "added", content: "  catch (e) {" },
        { type: "added", content: "    logError(e);" },
        { type: "added", content: "    return null;" },
      ] }]);
      d.setContent("HEAD", "src/service.ts", "function process() { try { doWork(); } catch (e) { logError(e); return null; } }");
    },
  },

  // === BUSINESS_RULE_LOCALIZED ===
  {
    name: "BR_TP_01_sibling_callers",
    ruleId: "BUSINESS_RULE_LOCALIZED",
    expectedToDetect: true,
    setup: (d) => {
      d.setChangedFiles(["src/order.ts"]);
      d.setDiff("src/order.ts", [{ oldStart: 20, oldLines: 1, newStart: 20, newLines: 3, lines: [
        { type: "removed", content: "  const discount = calculateDiscount(user);" },
        { type: "added", content: "  if (user.type === 'vip') {" },
        { type: "added", content: "    discount = 0.2;" },
        { type: "added", content: "  }" },
      ] }]);
      d.setContent("BASE", "src/order.ts", `
function calculateDiscount(user) { return user.type === 'vip' ? 0.2 : 0; }
function processOrderA(user) { const discount = calculateDiscount(user); }
function processOrderB(user) { const discount = calculateDiscount(user); }
`);
      d.setContent("HEAD", "src/order.ts", `
function calculateDiscount(user) { return user.type === 'vip' ? 0.2 : 0; }
function processOrderA(user) { if (user.type === 'vip') { discount = 0.2; } }
function processOrderB(user) { const discount = calculateDiscount(user); }
`);
    },
  },
  {
    name: "BR_FP_01_single_caller",
    ruleId: "BUSINESS_RULE_LOCALIZED",
    expectedToDetect: false,
    setup: (d) => {
      d.setChangedFiles(["src/unique.ts"]);
      d.setDiff("src/unique.ts", [{ oldStart: 10, oldLines: 1, newStart: 10, newLines: 3, lines: [
        { type: "removed", content: "  const result = computeValue(input);" },
        { type: "added", content: "  if (input > 0) {" },
        { type: "added", content: "    result = input * 2;" },
        { type: "added", content: "  }" },
      ] }]);
      d.setContent("BASE", "src/unique.ts", "function computeValue(x) { return x * 2; } function onlyCaller(x) { return computeValue(x); }");
      d.setContent("HEAD", "src/unique.ts", "function computeValue(x) { return x * 2; } function onlyCaller(x) { if (x > 0) { return x * 2; } }");
    },
  },
];

const RULE_EVALUATORS = {
  GUARD_WEAKENED: guardWeakenedRule,
  VALIDATION_REMOVED: validationRemovedRule,
  ERROR_PATH_SUCCESS_FALLBACK: errorPathSuccessFallbackRule,
  BUSINESS_RULE_LOCALIZED: businessRuleLocalizedRule,
};

// Global collection for results
const evaluationResults: FindingReview[] = [];

describe("Diff Rules Precision Summary", () => {
  const bundle = createMinimalBundle();
  const graph = buildAssuranceGraph(bundle);
  const hashService = new MockHashService();

  for (const tc of TEST_CASES) {
    it(`${tc.name}: ${tc.expectedToDetect ? "TP" : "FP_prevention"}`, () => {
      const diffAccess = new MockDiffAccess();
      tc.setup(diffAccess);

      const rule = RULE_EVALUATORS[tc.ruleId];
      const result = rule.evaluateDiff(graph, diffAccess, "BASE", "HEAD", hashService);

      const found = result.candidates.length > 0;

      // Determine classification
      let classification: "TP" | "FP" | "Uncertain";
      if (tc.expectedToDetect) {
        classification = found ? "TP" : "FP"; // Expected to find, didn't find = FN (treated as FP for rate)
      } else {
        classification = found ? "FP" : "TP"; // Expected not to find, found = FP
      }

      evaluationResults.push({
        finding_id: tc.name,
        rule_id: tc.ruleId,
        classification,
        comment: `Expected: ${tc.expectedToDetect ? "detect" : "skip"}, Found: ${found}`,
        severity: "medium",
        category: "assurance",
      });

      // Assert expectation
      if (tc.expectedToDetect) {
        expect(found).toBe(true);
      } else {
        expect(found).toBe(false);
      }
    });
  }

  // Summary test
  it("FP rate must be <= 15% target", () => {
    const { fp_rate, target, pass } = evaluateFP(evaluationResults, "phase1");

    // Output summary
    console.log("\n=== Precision Evaluation Summary ===");
    console.log(`Total test cases: ${evaluationResults.length}`);
    console.log(`TP (correct): ${evaluationResults.filter(r => r.classification === "TP").length}`);
    console.log(`FP (incorrect): ${evaluationResults.filter(r => r.classification === "FP").length}`);
    console.log(`Uncertain: ${evaluationResults.filter(r => r.classification === "Uncertain").length}`);
    console.log(`FP Rate: ${fp_rate}%`);
    console.log(`Target: <= ${target}%`);
    console.log(`Result: ${pass ? "PASS" : "FAIL"}`);
    console.log("====================================\n");

    // Assert FP rate within target
    expect(fp_rate).toBeLessThanOrEqual(target);
  });
});
