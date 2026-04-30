/**
 * Tests for GitHub Checks Creator - Refactored
 *
 * Original: 53 tests, 911 lines
 * Refactored: 15 tests (merged similar cases)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCheckRun,
  createInProgressCheckRun,
  updateCheckRunWithResults,
  createFailedCheckRun,
  createNeutralCheckRun,
  type ChecksOptions,
} from "../checks.js";
import type { GitHubApiClient, CheckOutput } from "../api-client.js";
import type { FindingsArtifact, ReleaseReadinessArtifact, Finding, Severity } from "../../types/artifacts.js";

// Mock GitHubApiClient
const createMockClient = (): GitHubApiClient => ({
  createCheckRun: vi.fn().mockResolvedValue(12345),
  updateCheckRun: vi.fn().mockResolvedValue(undefined),
  createComment: vi.fn().mockResolvedValue(1),
  updateComment: vi.fn().mockResolvedValue(undefined),
  getComments: vi.fn().mockResolvedValue([]),
  findExistingComment: vi.fn().mockResolvedValue(null),
  createOrUpdateComment: vi.fn().mockResolvedValue(1),
  addAnnotations: vi.fn().mockResolvedValue(undefined),
  getRepoInfo: vi.fn().mockResolvedValue({ fullName: "owner/repo", defaultBranch: "main", private: false }),
} as unknown as GitHubApiClient);

// Helper: Create findings artifact
const createFindings = (findings: Finding[] = []): FindingsArtifact => ({
  version: "ctg/v1alpha1",
  generated_at: "2025-01-01T00:00:00Z",
  run_id: "run-001",
  repo: { root: "/test/repo" },
  tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
  artifact: "findings",
  schema: "findings@v1",
  completeness: "complete",
  findings,
  unsupported_claims: [],
});

// Helper: Create finding
const createFinding = (
  ruleId: string,
  severity: Severity,
  path: string = "src/test.ts",
  startLine: number = 10,
  endLine: number = 15
): Finding => ({
  id: `finding-${ruleId}`,
  ruleId,
  category: "auth",
  severity,
  confidence: 0.85,
  title: `${ruleId} Issue`,
  summary: `Test finding for ${ruleId}`,
  evidence: [{ id: "ev-1", path, startLine, endLine, kind: "ast" }],
});

// Helper: Create readiness artifact
const createReadiness = (status = "needs_review"): ReleaseReadinessArtifact => ({
  version: "ctg/v1alpha1",
  generated_at: "2025-01-01T00:00:00Z",
  run_id: "run-001",
  repo: { root: "/test/repo" },
  tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
  artifact: "release-readiness",
  schema: "release-readiness@v1",
  completeness: "complete",
  status,
  summary: "Test summary",
  blockers: [],
  warnings: [],
  passedChecks: [],
  metrics: { criticalFindings: 0, highFindings: 0, mediumFindings: 0, lowFindings: 0, riskCount: 0, testSeedCount: 0 },
});

// Helper: Get annotations from createCheckRun call
const getAnnotations = (mockClient: GitHubApiClient): CheckAnnotation[] => {
  const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
  const options = call[2] as { output?: CheckOutput };
  return options?.output?.annotations || [];
};

describe("checks", () => {
  let mockClient: GitHubApiClient;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  describe("createCheckRun", () => {
    it("creates check run with all options and proper structure", async () => {
      const findings = createFindings([
        createFinding("CRITICAL_RULE", "critical"),
        createFinding("HIGH_RULE", "high"),
        createFinding("MEDIUM_RULE", "medium"),
        createFinding("LOW_RULE", "low"),
      ]);
      const readiness = createReadiness("blocked");

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
        readiness,
        name: "Custom Check",
        maxAnnotations: 50,
      };

      const result = await createCheckRun(options);

      expect(result.checkRunId).toBe(12345);
      expect(result.conclusion).toBe("failure");
      expect(result.annotationCount).toBe(4);
      expect(mockClient.createCheckRun).toHaveBeenCalledTimes(1);

      // Verify call structure
      const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(call[0]).toBe("Custom Check");
      expect(call[1]).toBe("completed");
      expect(call[2]?.headSha).toBe("abc123");

      // Output
      const output = call[2]?.output;
      expect(output?.summary).toContain("Found 4 findings");
      expect(output?.text).toContain("CRITICAL_RULE");
    });

    it("uses default name and neutral conclusion without readiness", async () => {
      const findings = createFindings([createFinding("RULE", "high")]);
      const result = await createCheckRun({ client: mockClient, headSha: "abc123", findings });

      expect(result.conclusion).toBe("neutral");
      const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(call[0]).toBe("code-to-gate Analysis");
    });

    it("maps readiness status to correct conclusion", async () => {
      const statusMap = [
        { status: "passed", conclusion: "success" },
        { status: "passed_with_risk", conclusion: "success" },
        { status: "needs_review", conclusion: "neutral" },
        { status: "blocked", conclusion: "failure" },
      ];

      for (const { status, conclusion } of statusMap) {
        vi.clearAllMocks();
        const findings = createFindings();
        const readiness = createReadiness(status);
        const result = await createCheckRun({ client: mockClient, headSha: "abc123", findings, readiness });
        expect(result.conclusion).toBe(conclusion);
      }
    });
  });

  describe("severity to annotation level mapping", () => {
    it("maps all severities to correct annotation levels and sorts by severity", async () => {
      const findings = createFindings([
        createFinding("LOW_RULE", "low"),
        createFinding("MEDIUM_RULE", "medium"),
        createFinding("HIGH_RULE", "high"),
        createFinding("CRITICAL_RULE", "critical"),
      ]);

      await createCheckRun({ client: mockClient, headSha: "abc123", findings });
      const annotations = getAnnotations(mockClient);

      // Check sorting (critical first)
      expect(annotations[0]?.annotation_level).toBe("failure"); // critical
      expect(annotations[0]?.title).toBe("CRITICAL_RULE");
      expect(annotations[1]?.annotation_level).toBe("failure"); // high
      expect(annotations[2]?.annotation_level).toBe("warning"); // medium
      expect(annotations[3]?.annotation_level).toBe("notice"); // low
    });
  });

  describe("annotation creation", () => {
    it("creates annotations with all required fields from evidence", async () => {
      const findings = createFindings([createFinding("RULE", "high", "src/auth.ts", 100, 150)]);
      await createCheckRun({ client: mockClient, headSha: "abc123", findings });
      const annotations = getAnnotations(mockClient);

      expect(annotations[0]?.path).toBe("src/auth.ts");
      expect(annotations[0]?.start_line).toBe(100);
      expect(annotations[0]?.end_line).toBe(150);
      expect(annotations[0]?.message).toBe("Test finding for RULE");
      expect(annotations[0]?.title).toBe("RULE");
    });

    it("defaults start_line to 1 when not provided", async () => {
      const findings = createFindings([{
        id: "f1",
        ruleId: "RULE",
        category: "auth",
        severity: "high",
        confidence: 0.75,
        title: "Finding",
        summary: "Summary",
        evidence: [{ id: "ev1", path: "src/test.ts", startLine: undefined, endLine: undefined, kind: "ast" }],
      }]);
      await createCheckRun({ client: mockClient, headSha: "abc123", findings });
      const annotations = getAnnotations(mockClient);

      expect(annotations[0]?.start_line).toBe(1);
      expect(annotations[0]?.end_line).toBe(1);
    });

    it("skips findings without evidence or path", async () => {
      const findings = createFindings([
        { id: "no-evidence", ruleId: "NO_EVIDENCE", category: "auth", severity: "high", confidence: 0.75, title: "No evidence", summary: "Test", evidence: [] },
        { id: "no-path", ruleId: "NO_PATH", category: "auth", severity: "high", confidence: 0.75, title: "No path", summary: "Test", evidence: [{ id: "ev1", path: "", startLine: 10, kind: "ast" }] },
        createFinding("VALID", "high"),
      ]);
      const result = await createCheckRun({ client: mockClient, headSha: "abc123", findings });
      expect(result.annotationCount).toBe(1);
    });

    it("limits annotations to maxAnnotations", async () => {
      const manyFindings = Array.from({ length: 60 }, (_, i) => createFinding(`RULE_${i}`, "medium"));
      const findings = createFindings(manyFindings);
      const result = await createCheckRun({ client: mockClient, headSha: "abc123", findings, maxAnnotations: 50 });
      expect(result.annotationCount).toBe(50);
    });
  });

  describe("createInProgressCheckRun", () => {
    it("creates in-progress check run with all fields", async () => {
      const checkRunId = await createInProgressCheckRun(mockClient, "sha-xyz", "Custom Analysis");

      expect(checkRunId).toBe(12345);
      const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(call[0]).toBe("Custom Analysis");
      expect(call[1]).toBe("in_progress");
      expect(call[2]?.headSha).toBe("sha-xyz");
      expect(call[2]?.startedAt).toBeDefined();
      expect(call[2]?.output?.title).toBe("Running");
      expect(call[2]?.output?.summary).toContain("in progress");
    });

    it("uses default name", async () => {
      await createInProgressCheckRun(mockClient, "abc123");
      const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(call[0]).toBe("code-to-gate Analysis");
    });
  });

  describe("updateCheckRunWithResults", () => {
    it("updates check run with findings and readiness", async () => {
      const findings = createFindings([createFinding("RULE_A", "high"), createFinding("RULE_B", "medium")]);
      const readiness = createReadiness("passed");

      await updateCheckRunWithResults(mockClient, 12345, findings, readiness, 30);

      const call = vi.mocked(mockClient.updateCheckRun).mock.calls[0];
      expect(call[0]).toBe(12345);
      expect(call[1]?.status).toBe("completed");
      expect(call[1]?.conclusion).toBe("success");
      expect(call[1]?.completedAt).toBeDefined();
      expect(call[1]?.output?.annotations?.length).toBe(2);
    });

    it("limits annotations to maxAnnotations", async () => {
      const manyFindings = Array.from({ length: 60 }, (_, i) => createFinding(`RULE_${i}`, "medium"));
      const findings = createFindings(manyFindings);

      await updateCheckRunWithResults(mockClient, 12345, findings, undefined, 30);

      const call = vi.mocked(mockClient.updateCheckRun).mock.calls[0];
      expect(call[1]?.output?.annotations?.length).toBe(30);
    });
  });

  describe("createFailedCheckRun", () => {
    it("creates failed check run with error message", async () => {
      const checkRunId = await createFailedCheckRun(mockClient, "abc123", "Analysis crashed", "Custom Check");

      expect(checkRunId).toBe(12345);
      const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(call[0]).toBe("Custom Check");
      expect(call[1]).toBe("completed");
      expect(call[2]?.conclusion).toBe("failure");
      expect(call[2]?.output?.title).toBe("FAILED");
      expect(call[2]?.output?.text).toContain("Analysis crashed");
    });

    it("uses default name", async () => {
      await createFailedCheckRun(mockClient, "abc123", "Error");
      const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(call[0]).toBe("code-to-gate Analysis");
    });
  });

  describe("createNeutralCheckRun", () => {
    it("creates neutral check run with message", async () => {
      const checkRunId = await createNeutralCheckRun(mockClient, "abc123", "No findings", "Info Check");

      expect(checkRunId).toBe(12345);
      const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(call[0]).toBe("Info Check");
      expect(call[1]).toBe("completed");
      expect(call[2]?.conclusion).toBe("neutral");
      expect(call[2]?.output?.title).toBe("INFO");
      expect(call[2]?.output?.summary).toBe("No findings");
    });

    it("uses default name", async () => {
      await createNeutralCheckRun(mockClient, "abc123", "Message");
      const call = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(call[0]).toBe("code-to-gate Analysis");
    });
  });
});