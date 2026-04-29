/**
 * Tests for GitHub Checks Creator
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCheckRun,
  createInProgressCheckRun,
  updateCheckRunWithResults,
  createFailedCheckRun,
  createNeutralCheckRun,
  type ChecksOptions,
  type ChecksResult,
} from "../checks.js";
import type { GitHubApiClient, CheckAnnotation, CheckOutput } from "../api-client.js";
import type {
  FindingsArtifact,
  ReleaseReadinessArtifact,
  Finding,
  Severity,
} from "../../types/artifacts.js";

// Mock GitHubApiClient
const createMockClient = (): GitHubApiClient => {
  return {
    createCheckRun: vi.fn().mockResolvedValue(12345),
    updateCheckRun: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(1),
    updateComment: vi.fn().mockResolvedValue(undefined),
    getComments: vi.fn().mockResolvedValue([]),
    findExistingComment: vi.fn().mockResolvedValue(null),
    createOrUpdateComment: vi.fn().mockResolvedValue(1),
    addAnnotations: vi.fn().mockResolvedValue(undefined),
    getRepoInfo: vi.fn().mockResolvedValue({
      fullName: "owner/repo",
      defaultBranch: "main",
      private: false,
    }),
  } as unknown as GitHubApiClient;
};

describe("checks", () => {
  let mockClient: GitHubApiClient;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.clearAllMocks();
  });

  const createMockFindings = (): FindingsArtifact => ({
    version: "ctg/v1alpha1",
    generated_at: "2025-01-01T00:00:00Z",
    run_id: "run-001",
    repo: { root: "/test/repo" },
    tool: {
      name: "code-to-gate",
      version: "0.1.0",
      plugin_versions: [],
    },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [],
    unsupported_claims: [],
  });

  const createMockFinding = (
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
    evidence: [
      {
        id: "evidence-1",
        path,
        startLine,
        endLine,
        kind: "ast",
      },
    ],
  });

  const createMockReadiness = (): ReleaseReadinessArtifact => ({
    version: "ctg/v1alpha1",
    generated_at: "2025-01-01T00:00:00Z",
    run_id: "run-001",
    repo: { root: "/test/repo" },
    tool: {
      name: "code-to-gate",
      version: "0.1.0",
      plugin_versions: [],
    },
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "needs_review",
    summary: "Test summary",
    blockers: [],
    warnings: [],
    passedChecks: [],
    metrics: {
      criticalFindings: 0,
      highFindings: 0,
      mediumFindings: 0,
      lowFindings: 0,
      riskCount: 0,
      testSeedCount: 0,
    },
  });

  describe("createCheckRun", () => {
    it("creates check run with findings", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE1", "high"));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      const result = await createCheckRun(options);

      expect(result.checkRunId).toBe(12345);
      expect(mockClient.createCheckRun).toHaveBeenCalledTimes(1);
    });

    it("uses default check run name", async () => {
      const findings = createMockFindings();
      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[0]).toBe("code-to-gate Analysis");
    });

    it("uses custom check run name", async () => {
      const findings = createMockFindings();
      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
        name: "Custom Check Name",
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[0]).toBe("Custom Check Name");
    });

    it("sets conclusion based on readiness status", async () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "passed";

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
        readiness,
      };

      const result = await createCheckRun(options);
      expect(result.conclusion).toBe("success");
    });

    it("sets conclusion to failure for blocked status", async () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "blocked";

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
        readiness,
      };

      const result = await createCheckRun(options);
      expect(result.conclusion).toBe("failure");
    });

    it("sets conclusion to neutral for needs_review status", async () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "needs_review";

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
        readiness,
      };

      const result = await createCheckRun(options);
      expect(result.conclusion).toBe("neutral");
    });

    it("defaults to neutral conclusion without readiness", async () => {
      const findings = createMockFindings();
      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      const result = await createCheckRun(options);
      expect(result.conclusion).toBe("neutral");
    });

    it("creates annotations from findings", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE_A", "critical", "src/auth.ts", 42, 50));
      findings.findings.push(createMockFinding("RULE_B", "high", "src/config.ts", 10, 20));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      const result = await createCheckRun(options);
      expect(result.annotationCount).toBe(2);
    });

    it("skips findings without evidence", async () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "no-evidence",
        ruleId: "NO_EVIDENCE",
        category: "auth",
        severity: "high",
        confidence: 0.75,
        title: "No evidence finding",
        summary: "Finding without evidence",
        evidence: [], // No evidence
      });

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      const result = await createCheckRun(options);
      expect(result.annotationCount).toBe(0);
    });

    it("skips findings with evidence without path", async () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "no-path",
        ruleId: "NO_PATH",
        category: "auth",
        severity: "high",
        confidence: 0.75,
        title: "No path finding",
        summary: "Finding without path",
        evidence: [
          {
            id: "evidence-no-path",
            path: "", // Empty path
            startLine: 10,
            kind: "ast",
          },
        ],
      });

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      const result = await createCheckRun(options);
      expect(result.annotationCount).toBe(0);
    });

    it("limits annotations to maxAnnotations", async () => {
      const findings = createMockFindings();
      for (let i = 0; i < 60; i++) {
        findings.findings.push(createMockFinding(`RULE_${i}`, "medium", `src/file${i}.ts`, i));
      }

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
        maxAnnotations: 50,
      };

      const result = await createCheckRun(options);
      expect(result.annotationCount).toBe(50);
    });

    it("sorts annotations by severity (critical first)", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("LOW_RULE", "low"));
      findings.findings.push(createMockFinding("CRITICAL_RULE", "critical"));
      findings.findings.push(createMockFinding("MEDIUM_RULE", "medium"));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
        maxAnnotations: 3,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      // Critical should be first
      expect(annotations[0]?.annotation_level).toBe("failure");
      expect(annotations[0]?.title).toBe("CRITICAL_RULE");
    });

    it("sets completed status in check run", async () => {
      const findings = createMockFindings();
      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[1]).toBe("completed");
    });

    it("includes headSha in check run", async () => {
      const findings = createMockFindings();
      const options: ChecksOptions = {
        client: mockClient,
        headSha: "sha-abc123def456",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2];
      expect(callOptions?.headSha).toBe("sha-abc123def456");
    });

    it("includes output with summary", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE1", "critical"));
      findings.findings.push(createMockFinding("RULE2", "high"));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };

      expect(callOptions?.output?.summary).toContain("Found 2 findings");
      expect(callOptions?.output?.summary).toContain("Critical: 1");
      expect(callOptions?.output?.summary).toContain("High: 1");
    });

    it("includes output with text containing finding details", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("TEST_RULE", "high", "src/test.ts", 100));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };

      expect(callOptions?.output?.text).toContain("TEST_RULE");
      expect(callOptions?.output?.text).toContain("src/test.ts:100");
      expect(callOptions?.output?.text).toContain("Severity");
      expect(callOptions?.output?.text).toContain("Confidence");
    });
  });

  describe("severity to annotation level mapping", () => {
    it("maps critical to failure", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("CRIT", "critical"));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.annotation_level).toBe("failure");
    });

    it("maps high to failure", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("HIGH", "high"));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.annotation_level).toBe("failure");
    });

    it("maps medium to warning", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("MED", "medium"));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.annotation_level).toBe("warning");
    });

    it("maps low to notice", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("LOW", "low"));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.annotation_level).toBe("notice");
    });
  });

  describe("annotation creation", () => {
    it("creates annotation with path", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE", "high", "src/components/Button.tsx", 25));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.path).toBe("src/components/Button.tsx");
    });

    it("creates annotation with start_line", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE", "high", "src/test.ts", 100));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.start_line).toBe(100);
    });

    it("creates annotation with end_line", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE", "high", "src/test.ts", 10, 25));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.end_line).toBe(25);
    });

    it("creates annotation with message from summary", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE", "high", "src/test.ts", 10));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.message).toBe("Test finding for RULE");
    });

    it("creates annotation with title from ruleId", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("SECURITY_RULE_001", "critical"));

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.title).toBe("SECURITY_RULE_001");
    });

    it("defaults start_line to 1 when not provided", async () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-no-line",
        ruleId: "NO_LINE",
        category: "auth",
        severity: "high",
        confidence: 0.75,
        title: "Finding",
        summary: "Summary",
        evidence: [
          {
            id: "ev1",
            path: "src/test.ts",
            startLine: undefined,
            endLine: undefined,
            kind: "ast",
          },
        ],
      });

      const options: ChecksOptions = {
        client: mockClient,
        headSha: "abc123",
        findings,
      };

      await createCheckRun(options);

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const callOptions = createCall[2] as { output?: CheckOutput };
      const annotations = callOptions?.output?.annotations || [];

      expect(annotations[0]?.start_line).toBe(1);
      expect(annotations[0]?.end_line).toBe(1);
    });
  });

  describe("createInProgressCheckRun", () => {
    it("creates in-progress check run", async () => {
      const checkRunId = await createInProgressCheckRun(mockClient, "abc123");

      expect(checkRunId).toBe(12345);
      expect(mockClient.createCheckRun).toHaveBeenCalledTimes(1);
    });

    it("uses default name", async () => {
      await createInProgressCheckRun(mockClient, "abc123");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[0]).toBe("code-to-gate Analysis");
    });

    it("uses custom name", async () => {
      await createInProgressCheckRun(mockClient, "abc123", "Custom Analysis");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[0]).toBe("Custom Analysis");
    });

    it("sets status to in_progress", async () => {
      await createInProgressCheckRun(mockClient, "abc123");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[1]).toBe("in_progress");
    });

    it("includes headSha", async () => {
      await createInProgressCheckRun(mockClient, "sha-xyz");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[2]?.headSha).toBe("sha-xyz");
    });

    it("includes startedAt timestamp", async () => {
      await createInProgressCheckRun(mockClient, "abc123");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[2]?.startedAt).toBeDefined();
    });

    it("includes output with running status", async () => {
      await createInProgressCheckRun(mockClient, "abc123");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const output = createCall[2]?.output;

      expect(output?.title).toBe("Running");
      expect(output?.summary).toContain("in progress");
    });
  });

  describe("updateCheckRunWithResults", () => {
    it("updates check run with findings", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE", "high"));

      await updateCheckRunWithResults(mockClient, 12345, findings);

      expect(mockClient.updateCheckRun).toHaveBeenCalledTimes(1);
    });

    it("sets status to completed", async () => {
      const findings = createMockFindings();

      await updateCheckRunWithResults(mockClient, 12345, findings);

      const updateCall = vi.mocked(mockClient.updateCheckRun).mock.calls[0];
      const options = updateCall[1];
      expect(options?.status).toBe("completed");
    });

    it("sets conclusion based on readiness", async () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "passed";

      await updateCheckRunWithResults(mockClient, 12345, findings, readiness);

      const updateCall = vi.mocked(mockClient.updateCheckRun).mock.calls[0];
      const options = updateCall[1];
      expect(options?.conclusion).toBe("success");
    });

    it("includes completedAt timestamp", async () => {
      const findings = createMockFindings();

      await updateCheckRunWithResults(mockClient, 12345, findings);

      const updateCall = vi.mocked(mockClient.updateCheckRun).mock.calls[0];
      const options = updateCall[1];
      expect(options?.completedAt).toBeDefined();
    });

    it("includes annotations in output", async () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE_A", "high"));
      findings.findings.push(createMockFinding("RULE_B", "medium"));

      await updateCheckRunWithResults(mockClient, 12345, findings);

      const updateCall = vi.mocked(mockClient.updateCheckRun).mock.calls[0];
      const options = updateCall[1] as { output?: CheckOutput };
      expect(options?.output?.annotations?.length).toBe(2);
    });

    it("limits annotations to maxAnnotations parameter", async () => {
      const findings = createMockFindings();
      for (let i = 0; i < 60; i++) {
        findings.findings.push(createMockFinding(`RULE_${i}`, "medium"));
      }

      await updateCheckRunWithResults(mockClient, 12345, findings, undefined, 30);

      const updateCall = vi.mocked(mockClient.updateCheckRun).mock.calls[0];
      const options = updateCall[1] as { output?: CheckOutput };
      expect(options?.output?.annotations?.length).toBe(30);
    });
  });

  describe("createFailedCheckRun", () => {
    it("creates failed check run with error message", async () => {
      const checkRunId = await createFailedCheckRun(mockClient, "abc123", "Analysis crashed");

      expect(checkRunId).toBe(12345);
      expect(mockClient.createCheckRun).toHaveBeenCalledTimes(1);
    });

    it("sets status to completed", async () => {
      await createFailedCheckRun(mockClient, "abc123", "Error");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[1]).toBe("completed");
    });

    it("sets conclusion to failure", async () => {
      await createFailedCheckRun(mockClient, "abc123", "Error");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[2]?.conclusion).toBe("failure");
    });

    it("includes error message in output text", async () => {
      await createFailedCheckRun(mockClient, "abc123", "Something went wrong");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const output = createCall[2]?.output;

      expect(output?.text).toContain("Something went wrong");
    });

    it("uses default name", async () => {
      await createFailedCheckRun(mockClient, "abc123", "Error");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[0]).toBe("code-to-gate Analysis");
    });

    it("uses custom name", async () => {
      await createFailedCheckRun(mockClient, "abc123", "Error", "Custom Check");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[0]).toBe("Custom Check");
    });

    it("includes FAILED title in output", async () => {
      await createFailedCheckRun(mockClient, "abc123", "Error");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const output = createCall[2]?.output;

      expect(output?.title).toBe("FAILED");
    });
  });

  describe("createNeutralCheckRun", () => {
    it("creates neutral check run with message", async () => {
      const checkRunId = await createNeutralCheckRun(mockClient, "abc123", "No findings detected");

      expect(checkRunId).toBe(12345);
      expect(mockClient.createCheckRun).toHaveBeenCalledTimes(1);
    });

    it("sets status to completed", async () => {
      await createNeutralCheckRun(mockClient, "abc123", "Message");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[1]).toBe("completed");
    });

    it("sets conclusion to neutral", async () => {
      await createNeutralCheckRun(mockClient, "abc123", "Message");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[2]?.conclusion).toBe("neutral");
    });

    it("includes message in output summary", async () => {
      await createNeutralCheckRun(mockClient, "abc123", "Analysis completed with no issues");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const output = createCall[2]?.output;

      expect(output?.summary).toBe("Analysis completed with no issues");
    });

    it("uses default name", async () => {
      await createNeutralCheckRun(mockClient, "abc123", "Message");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[0]).toBe("code-to-gate Analysis");
    });

    it("uses custom name", async () => {
      await createNeutralCheckRun(mockClient, "abc123", "Message", "Info Check");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      expect(createCall[0]).toBe("Info Check");
    });

    it("includes INFO title in output", async () => {
      await createNeutralCheckRun(mockClient, "abc123", "Message");

      const createCall = vi.mocked(mockClient.createCheckRun).mock.calls[0];
      const output = createCall[2]?.output;

      expect(output?.title).toBe("INFO");
    });
  });

  describe("readiness status to conclusion mapping", () => {
    it("maps passed to success", async () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "passed";

      const result = await createCheckRun({
        client: mockClient,
        headSha: "abc123",
        findings,
        readiness,
      });

      expect(result.conclusion).toBe("success");
    });

    it("maps passed_with_risk to success", async () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "passed_with_risk";

      const result = await createCheckRun({
        client: mockClient,
        headSha: "abc123",
        findings,
        readiness,
      });

      expect(result.conclusion).toBe("success");
    });

    it("maps needs_review to neutral", async () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "needs_review";

      const result = await createCheckRun({
        client: mockClient,
        headSha: "abc123",
        findings,
        readiness,
      });

      expect(result.conclusion).toBe("neutral");
    });

    it("maps blocked to failure", async () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "blocked";

      const result = await createCheckRun({
        client: mockClient,
        headSha: "abc123",
        findings,
        readiness,
      });

      expect(result.conclusion).toBe("failure");
    });
  });
});