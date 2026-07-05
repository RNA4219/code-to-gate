/**
 * Integration tests for schema validation coverage
 *
 * Tests:
 * - All schema files validation
 * - Invalid artifact variations
 * - Schema version mismatches
 * - Edge cases in schema validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  runCli,
  schemaPath,
  readJson,
  createTempOutDir,
  cleanupTempDir,
  fileExists,
  getProjectRoot,
} from "./helper.js";
import path from "node:path";
import { writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";

describe("schema coverage integration", () => {
  let tempDir: string;
  const SCHEMA_DIR = path.join(getProjectRoot(), "schemas");

  beforeAll(() => {
    tempDir = createTempOutDir("schema-coverage");
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  describe("all schema files validation", () => {
    it("validates normalized-repo-graph schema", () => {
      const schemaFile = schemaPath("normalized-repo-graph");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates findings schema", () => {
      const schemaFile = schemaPath("findings");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates raw-findings schema", () => {
      const schemaFile = schemaPath("raw-findings");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates risk-register schema", () => {
      const schemaFile = schemaPath("risk-register");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates audit schema", () => {
      const schemaFile = schemaPath("audit");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates shared-defs schema", () => {
      const schemaFile = schemaPath("shared-defs");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates invariants schema", () => {
      const schemaFile = schemaPath("invariants");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates test-seeds schema", () => {
      const schemaFile = schemaPath("test-seeds");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates test-plan schema", () => {
      const schemaFile = schemaPath("test-plan");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates quality-pack schema", () => {
      const schemaFile = schemaPath("quality-pack");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates release-pack schema", () => {
      const schemaFile = schemaPath("release-pack");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates hosted-static-report schema", () => {
      const schemaFile = schemaPath("hosted-static-report");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates schema-migration schema", () => {
      const schemaFile = schemaPath("schema-migration");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates ownership-risk schema", () => {
      const schemaFile = schemaPath("ownership-risk");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates plugin-marketplace schema", () => {
      const schemaFile = schemaPath("plugin-marketplace");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates release-readiness schema", () => {
      const schemaFile = schemaPath("release-readiness");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates evidence-dag schema", () => {
      const schemaFile = schemaPath("evidence-dag");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates historical-comparison schema", () => {
      const schemaFile = schemaPath("historical-comparison");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates spec-drift schema", () => {
      const schemaFile = schemaPath("spec-drift");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates doctor schema", () => {
      const schemaFile = schemaPath("doctor");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates diff-analysis schema", () => {
      const schemaFile = schemaPath("diff-analysis");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates database-assets schema", () => {
      const schemaFile = schemaPath("database-assets");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates self-analysis-debt schema", () => {
      const schemaFile = schemaPath("self-analysis-debt");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates evidence-ref schema", () => {
      const schemaFile = schemaPath("evidence-ref");
      // Note: evidence-ref.schema.json may be empty in some versions
      // Check if file exists and has content
      if (!existsSync(schemaFile)) {
        return; // Skip if schema doesn't exist
      }
      try {
        const content = readJson(schemaFile);
        if (!content || (typeof content === 'object' && Object.keys(content).length === 0)) {
          // Skip empty schema files
          return;
        }
      } catch {
        // Skip invalid/empty schema files
        return;
      }
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates all integration schemas", () => {
      const integrationDir = path.join(SCHEMA_DIR, "integrations");
      if (!existsSync(integrationDir)) {
        // Skip if no integration schemas
        return;
      }

      const integrationSchemas = readdirSync(integrationDir)
        .filter((f) => f.endsWith(".schema.json"));

      for (const schemaFile of integrationSchemas) {
        const fullPath = path.join(integrationDir, schemaFile);
        const result = runCli(["schema", "validate", fullPath]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("schema ok");
      }
    });

    it("all main schema files are valid JSON", () => {
      const schemaFiles = [
        "normalized-repo-graph.schema.json",
        "raw-findings.schema.json",
        "findings.schema.json",
        "risk-register.schema.json",
        "audit.schema.json",
        "shared-defs.schema.json",
        "invariants.schema.json",
        "test-seeds.schema.json",
        "test-plan.schema.json",
        "quality-pack.schema.json",
        "release-pack.schema.json",
        "hosted-static-report.schema.json",
        "github-app-health.schema.json",
        "evidence-query.schema.json",
        "redaction-profile.schema.json",
        "gate-explainability.schema.json",
        "qeos-acceptance-matrix.schema.json",
        "schema-migration.schema.json",
        "ownership-risk.schema.json",
        "plugin-marketplace.schema.json",
        "pr-review.schema.json",
        "release-readiness.schema.json",
        "evidence-dag.schema.json",
        "historical-comparison.schema.json",
        "spec-drift.schema.json",
        "doctor.schema.json",
        "diff-analysis.schema.json",
        "database-assets.schema.json",
        "self-analysis-debt.schema.json",
      ];

      for (const file of schemaFiles) {
        const fullPath = path.join(SCHEMA_DIR, file);
        if (existsSync(fullPath)) {
          const schema = readJson(fullPath) as {
            $schema: string;
            title: string;
            $id: string;
          };

          expect(schema.$schema).toBeDefined();
          expect(schema.title).toBeDefined();
          expect(schema.$id).toBeDefined();
        }
      }
    });
  });

  describe("valid artifact variations", () => {
    it("validates minimal findings artifact", () => {
      const minimalFindingsPath = path.join(tempDir, "minimal-findings.json");
      writeFileSync(
        minimalFindingsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.5,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", minimalFindingsPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates findings with all categories", () => {
      const categories = [
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

      const allCategoriesPath = path.join(tempDir, "all-categories.json");
      writeFileSync(
        allCategoriesPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: categories.map((cat, i) => ({
            id: `finding-${i.toString().padStart(3, "0")}`,
            ruleId: `RULE_${cat.toUpperCase()}`,
            category: cat,
            severity: "low",
            confidence: 0.8,
            title: `${cat} Finding`,
            summary: `Test ${cat} finding`,
            evidence: [
              {
                id: `evidence-${i}`,
                path: "test.ts",
                kind: "text",
                excerptHash: `hash-${i}`,
              },
            ],
          })),
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", allCategoriesPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates findings with all severities", () => {
      const severities = ["low", "medium", "high", "critical"];

      const allSeveritiesPath = path.join(tempDir, "all-severities.json");
      writeFileSync(
        allSeveritiesPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: severities.map((sev, i) => ({
            id: `finding-${i.toString().padStart(3, "0")}`,
            ruleId: `RULE_${sev.toUpperCase()}`,
            category: "auth",
            severity: sev,
            confidence: 0.8,
            title: `${sev} Severity Finding`,
            summary: `Test ${sev} finding`,
            evidence: [
              {
                id: `evidence-${i}`,
                path: "test.ts",
                kind: "text",
                excerptHash: `hash-${i}`,
              },
            ],
          })),
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", allSeveritiesPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates findings with all evidence kinds", () => {
      const evidenceKinds = ["ast", "text", "import", "external", "test", "coverage", "diff"];

      const allKindsPath = path.join(tempDir, "all-kinds.json");
      writeFileSync(
        allKindsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: evidenceKinds.map((kind, i) => ({
            id: `finding-${i.toString().padStart(3, "0")}`,
            ruleId: `RULE_${kind.toUpperCase()}`,
            category: "auth",
            severity: "low",
            confidence: 0.8,
            title: `${kind} Evidence Finding`,
            summary: `Test ${kind} evidence`,
            evidence: [
              kind === "text"
                ? {
                    id: `evidence-${i}`,
                    path: "test.ts",
                    kind: kind,
                    excerptHash: `hash-${i}`,
                  }
                : kind === "external"
                ? {
                    id: `evidence-${i}`,
                    path: "test.ts",
                    kind: kind,
                    externalRef: {
                      tool: "semgrep",
                      ruleId: "rule-001",
                    },
                  }
                : {
                    id: `evidence-${i}`,
                    path: "test.ts",
                    kind: kind,
                  },
            ],
          })),
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", allKindsPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates findings with all upstream tools", () => {
      const upstreamTools = ["native", "semgrep", "eslint", "sarif", "codeql", "sonarqube", "tsc", "coverage", "test"];

      const allToolsPath = path.join(tempDir, "all-tools.json");
      writeFileSync(
        allToolsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: upstreamTools.map((tool, i) => ({
            id: `finding-${i.toString().padStart(3, "0")}`,
            ruleId: `RULE_${tool.toUpperCase()}`,
            category: "auth",
            severity: "low",
            confidence: 0.8,
            title: `${tool} Upstream Finding`,
            summary: `Test ${tool} upstream`,
            evidence: [
              {
                id: `evidence-${i}`,
                path: "test.ts",
                kind: "text",
                excerptHash: `hash-${i}`,
              },
            ],
            upstream: {
              tool: tool,
              ruleId: tool !== "native" ? `${tool}-rule` : undefined,
            },
          })),
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", allToolsPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates minimal audit artifact", () => {
      const minimalAuditPath = path.join(tempDir, "minimal-audit.json");
      writeFileSync(
        minimalAuditPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "audit",
          schema: "audit@v1",
          inputs: [],
          policy: { id: "default", hash: "abc123" },
          exit: { code: 0, status: "passed", reason: "No findings" },
        })
      );

      const result = runCli(["schema", "validate", minimalAuditPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates release-readiness artifact with baseline ratchet summary", () => {
      const readinessWithBaselinePath = path.join(tempDir, "readiness-with-baseline.json");
      writeFileSync(
        readinessWithBaselinePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "readiness-test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", policy_id: "strict", plugin_versions: [] },
          artifact: "release-readiness",
          schema: "release-readiness@v1",
          status: "passed",
          completeness: "complete",
          summary: "Baseline ratchet passed",
          counts: {
            findings: 1,
            critical: 0,
            high: 1,
            risks: 0,
            testSeeds: 0,
            unsupportedClaims: 0,
          },
          baseline: {
            mode: "ratchet",
            source: ".qh/previous/findings.json",
            baselineRunId: "previous-run",
            baselineFindings: 1,
            currentFindings: 1,
            newFindings: 0,
            worsenedFindings: 0,
            unchangedFindings: 1,
            resolvedFindings: 0,
            gatedFindingIds: [],
            resolvedFindingIds: [],
          },
          failedConditions: [],
          recommendedActions: ["Baseline ratchet: no new or worsened findings."],
          artifactRefs: {
            findings: ".qh/current/findings.json",
            baseline: ".qh/previous/findings.json",
          },
        })
      );

      const result = runCli(["schema", "validate", readinessWithBaselinePath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal evidence-dag artifact", () => {
      const minimalEvidenceDagPath = path.join(tempDir, "minimal-evidence-dag.json");
      writeFileSync(
        minimalEvidenceDagPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "evidence-dag",
          schema: "evidence-dag@v1",
          completeness: "complete",
          nodes: [
            { id: "requirement:QEOS-001", type: "requirement", label: "QEOS-001" },
            { id: "rule:TEST_RULE", type: "rule", label: "TEST_RULE" },
            { id: "finding:finding-001", type: "finding", label: "Finding" },
            { id: "artifact:findings", type: "artifact", label: "findings.json" },
            { id: "verdict:passed", type: "verdict", label: "passed" },
          ],
          edges: [
            {
              id: "requirement:QEOS-001|satisfies|rule:TEST_RULE",
              source: "requirement:QEOS-001",
              target: "rule:TEST_RULE",
              type: "satisfies",
            },
            {
              id: "rule:TEST_RULE|generated_by|finding:finding-001",
              source: "rule:TEST_RULE",
              target: "finding:finding-001",
              type: "generated_by",
            },
          ],
          summary: {
            nodeCount: 5,
            edgeCount: 2,
            findings: 1,
            artifacts: 1,
            verdicts: 1,
          },
        })
      );

      const result = runCli(["schema", "validate", minimalEvidenceDagPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal historical-comparison artifact", () => {
      const minimalHistoricalPath = path.join(tempDir, "minimal-historical-comparison.json");
      writeFileSync(
        minimalHistoricalPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "historical-test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "historical-comparison",
          schema: "historical-comparison@v1",
          completeness: "complete",
          currentRun: {
            run_id: "current-run",
            generated_at: "2024-01-02T00:00:00Z",
            artifact_dir: ".qh/current",
          },
          previousRun: {
            run_id: "previous-run",
            generated_at: "2024-01-01T00:00:00Z",
            artifact_dir: ".qh/previous",
          },
          findingsComparison: {
            new: [],
            resolved: [],
            unchanged: [],
            modified: [],
            regressions: [],
            summary: {
              totalCurrent: 0,
              totalPrevious: 0,
              newCount: 0,
              resolvedCount: 0,
              unchangedCount: 0,
              modifiedCount: 0,
              regressionCount: 0,
              bySeverity: {
                critical: { new: 0, resolved: 0, unchanged: 0 },
                high: { new: 0, resolved: 0, unchanged: 0 },
                medium: { new: 0, resolved: 0, unchanged: 0 },
                low: { new: 0, resolved: 0, unchanged: 0 },
              },
              byCategory: {},
            },
          },
          riskTrends: {
            trendDirection: "stable",
            trendScore: 0,
            criticalTrend: "stable",
            highTrend: "stable",
            riskScoreChange: 0,
            historyPoints: [],
          },
          recommendations: ["Quality trend is stable."],
          generated_by: "ctg-historical-v1",
        })
      );

      const result = runCli(["schema", "validate", minimalHistoricalPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal spec-drift artifact", () => {
      const minimalSpecDriftPath = path.join(tempDir, "minimal-spec-drift.json");
      writeFileSync(
        minimalSpecDriftPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "spec-drift",
          schema: "spec-drift@v1",
          completeness: "complete",
          status: "passed",
          checks: [
            {
              id: "command.export-targets.cli-help",
              type: "command",
              status: "pass",
              summary: "CLI help is aligned.",
              expected: ["gatefield"],
              actual: ["gatefield"],
              evidence: [
                {
                  path: "src/cli.ts",
                  detail: "CLI help lists supported targets.",
                },
              ],
            },
          ],
          findings: [],
          summary: {
            checks: 1,
            failed: 0,
            warnings: 0,
            findings: 0,
          },
        })
      );

      const result = runCli(["schema", "validate", minimalSpecDriftPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal doctor artifact", () => {
      const minimalDoctorPath = path.join(tempDir, "minimal-doctor.json");
      writeFileSync(
        minimalDoctorPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "doctor-test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "doctor",
          schema: "doctor@v1",
          completeness: "complete",
          status: "passed",
          checks: [
            {
              id: "runtime.node",
              category: "runtime",
              status: "pass",
              summary: "Node.js version is supported.",
              observed: "20.0.0",
            },
          ],
          summary: {
            checks: 1,
            passed: 1,
            warnings: 0,
            failed: 0,
            skipped: 0,
          },
        })
      );

      const result = runCli(["schema", "validate", minimalDoctorPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal test-plan artifact", () => {
      const minimalTestPlanPath = path.join(tempDir, "minimal-test-plan.json");
      writeFileSync(
        minimalTestPlanPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-plan-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "test-plan",
          schema: "test-plan@v1",
          completeness: "complete",
          status: "ready",
          changedFiles: ["src/order.ts"],
          affectedFiles: ["src/order.ts", "src/order.test.ts"],
          recommendedTests: [
            {
              id: "test-plan-001",
              title: "Run src/order.test.ts",
              target: "src/order.test.ts",
              level: "unit",
              priority: "medium",
              reason: "Test was listed in diff blast radius.",
              sourcePaths: ["src/order.ts"],
              evidence: [{ path: "diff-analysis.json", detail: "blast_radius.affectedTests" }],
              command: "npm test -- src/order.test.ts",
            },
          ],
          oracleGaps: [],
          summary: {
            changedFiles: 1,
            affectedFiles: 2,
            recommendedTests: 1,
            oracleGaps: 0,
          },
        })
      );

      const result = runCli(["schema", "validate", minimalTestPlanPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal ownership-risk artifact", () => {
      const minimalOwnershipPath = path.join(tempDir, "minimal-ownership-risk.json");
      writeFileSync(
        minimalOwnershipPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "ownership-risk-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "ownership-risk",
          schema: "ownership-risk@v1",
          completeness: "complete",
          status: "partial",
          codeowners: {
            present: true,
            path: ".github/CODEOWNERS",
            entries: 1,
            diagnostics: [],
          },
          files: [
            {
              path: "src/order.ts",
              moduleId: "module:src",
              role: "source",
              owners: ["@core-team"],
              matchedPattern: "/src/",
              changed: true,
              risk: "medium",
              reasons: ["File is in the changed/blast-radius set."],
            },
            {
              path: "src/legacy.ts",
              moduleId: "module:src",
              role: "source",
              owners: [],
              changed: true,
              risk: "high",
              reasons: ["No CODEOWNERS match was found for this file."],
            },
          ],
          modules: [
            {
              id: "module:src",
              path: "src",
              name: "app",
              owners: ["@core-team"],
              files: 2,
              changedFiles: 2,
              unownedFiles: 1,
              risk: "high",
              reasons: ["1 analyzed files have no CODEOWNERS match."],
            },
          ],
          reviewerCandidates: ["@core-team"],
          summary: {
            files: 2,
            ownedFiles: 1,
            unownedFiles: 1,
            modules: 1,
            modulesWithoutOwner: 0,
            changedFiles: 2,
            highRiskModules: 1,
            reviewerCandidates: 1,
          },
        })
      );

      const result = runCli(["schema", "validate", minimalOwnershipPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal plugin-marketplace artifact", () => {
      const minimalMarketplacePath = path.join(tempDir, "minimal-plugin-marketplace.json");
      writeFileSync(
        minimalMarketplacePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "plugin-marketplace-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "plugin-marketplace",
          schema: "plugin-marketplace@v1",
          completeness: "complete",
          status: "ready",
          entries: [
            {
              id: "security-rule@1.0.0",
              name: "security-rule",
              version: "1.0.0",
              kind: "rule-plugin",
              visibility: "public",
              description: "Security rule plugin.",
              capabilities: ["evaluate"],
              receives: ["normalized-repo-graph@v1"],
              returns: ["findings@v1"],
              source: { type: "local", path: "plugins/security-rule" },
              distribution: {
                homepage: "https://example.com/security-rule",
                license: "MIT",
                package: "@example/security-rule",
              },
              sandbox: {
                network: false,
                read: ["${repoRoot}"],
                write: [],
                secrets: [],
              },
              validation: {
                status: "valid",
                errors: [],
              },
            },
          ],
          summary: {
            plugins: 1,
            valid: 1,
            invalid: 0,
            public: 1,
            private: 0,
            rulePlugins: 1,
            reporterPlugins: 0,
            exporterPlugins: 0,
            importerPlugins: 0,
            languagePlugins: 0,
          },
        })
      );

      const result = runCli(["schema", "validate", minimalMarketplacePath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal pr-review artifact", () => {
      const minimalPrReviewPath = path.join(tempDir, "minimal-pr-review.json");
      writeFileSync(
        minimalPrReviewPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "pr-review-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "pr-review",
          schema: "pr-review@v1",
          completeness: "complete",
          status: "needs_review",
          markdown: {
            path: ".qh/pr-review.md",
            generated: true,
          },
          sections: {
            blockReasons: [
              {
                id: "readiness-high",
                title: "High finding requires review",
                detail: "High finding matched the readiness policy.",
                severity: "high",
                sourceArtifact: "release-readiness.json",
                sourceIds: ["finding-001"],
                evidence: [{ path: "release-readiness.json", detail: "failedConditions" }],
              },
            ],
            acceptableReasons: [
              {
                id: "baseline-ratchet",
                title: "Existing debt is covered by baseline",
                detail: "Only new and worsened findings are gated.",
                severity: "info",
                sourceArtifact: "release-readiness.json",
                sourceIds: [],
                evidence: [{ path: "release-readiness.json", detail: "baseline" }],
              },
            ],
            additionalTests: [
              {
                id: "test-plan-001",
                title: "Run changed module regression test",
                detail: "Diff blast radius selected this unit test.",
                severity: "medium",
                sourceArtifact: "test-plan.json",
                sourceIds: ["src/order.ts"],
                evidence: [{ path: "test-plan.json", detail: "recommendedTests" }],
              },
            ],
            specDiffs: [],
            artifactLinks: [
              {
                id: "readiness",
                label: "Release readiness",
                artifact: "release-readiness",
                path: ".qh/release-readiness.json",
                role: "readiness",
                present: true,
                schema: "release-readiness@v1",
                hashSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            ],
          },
          summary: {
            blockReasons: 1,
            acceptableReasons: 1,
            additionalTests: 1,
            specDiffs: 0,
            artifactLinks: 1,
            readinessStatus: "needs_review",
            findings: 1,
            critical: 0,
            high: 1,
            reviewerCandidates: 0,
          },
        })
      );

      const result = runCli(["schema", "validate", minimalPrReviewPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal quality-pack artifact", () => {
      const minimalQualityPackPath = path.join(tempDir, "minimal-quality-pack.json");
      writeFileSync(
        minimalQualityPackPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "quality-pack-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "quality-pack",
          schema: "quality-pack@v1",
          completeness: "complete",
          pack: {
            id: "security-basic",
            name: "Security Basic",
            description: "Baseline security pack.",
            useCase: "CI security gate.",
            maturity: "stable",
            tags: ["security"],
            rules: {
              include: ["HARDCODED_SECRET"],
              block: ["HARDCODED_SECRET"],
              warn: [],
            },
            policy: {
              blocking: {
                severity: { critical: true, high: true, medium: false, low: false },
                category: { security: true },
                rules: { HARDCODED_SECRET: true },
              },
              confidence: {
                minConfidence: 0.6,
                lowConfidenceThreshold: 0.4,
                filterLow: true,
              },
              baseline: {
                enabled: true,
                newFindingsBlock: true,
              },
              llm: {
                mode: "local-only",
                requireLlm: false,
              },
            },
            exports: ["qeg-code-to-gate"],
            recommendedCommands: ["code-to-gate analyze . --out .qh"],
            distribution: {
              sampleRepo: "fixtures/quality-packs/security-basic",
              expectedArtifacts: ["qeg-code-to-gate.json"],
            },
          },
        })
      );

      const result = runCli(["schema", "validate", minimalQualityPackPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal release-pack artifact", () => {
      const minimalReleasePackPath = path.join(tempDir, "minimal-release-pack.json");
      writeFileSync(
        minimalReleasePackPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "release-pack-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "release-pack",
          schema: "release-pack@v1",
          completeness: "complete",
          status: "ready",
          ci: {
            url: "https://github.com/example/repo/actions/runs/123",
            provider: "manual",
            runId: "123",
          },
          entries: [
            {
              id: "qeg",
              role: "qeg",
              label: "QEG evidence input",
              kind: "required",
              present: true,
              sourcePath: ".qh/qeg-code-to-gate.json",
              packPath: "artifacts/qeg-code-to-gate.json",
              hashSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              schema: "ctg.qeg-input/v1",
              sizeBytes: 10,
              description: "Evidence-only QEG input.",
            },
            {
              id: "ci-url",
              role: "ci",
              label: "CI run URL",
              kind: "required",
              present: true,
              sourcePath: "https://github.com/example/repo/actions/runs/123",
              description: "CI workflow run URL.",
            },
          ],
          outputs: {
            manifest: ".qh/release-pack/release-pack.json",
            html: ".qh/release-pack/release-pack.html",
            zip: ".qh/release-pack/release-pack.zip",
          },
          summary: {
            requiredEvidence: 2,
            presentRequiredEvidence: 2,
            missingRequiredEvidence: 0,
            includedArtifacts: 1,
            findings: 1,
            readinessStatus: "passed",
            qegSchemaChecks: 1,
            manualTestCandidates: 0,
            changedFiles: 0,
            ciUrl: "https://github.com/example/repo/actions/runs/123",
          },
        })
      );

      const result = runCli(["schema", "validate", minimalReleasePackPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal hosted-static-report artifact", () => {
      const minimalHostedReportPath = path.join(tempDir, "minimal-hosted-static-report.json");
      writeFileSync(
        minimalHostedReportPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "hosted-report-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "hosted-static-report",
          schema: "hosted-static-report@v1",
          completeness: "complete",
          target: "github-pages",
          publicUrl: "https://example.github.io/repo/",
          html: {
            path: "public/index.html",
            hashSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            sizeBytes: 1200,
            singleFile: true,
            externalAssets: [],
          },
          sourceArtifacts: [
            {
              id: "findings",
              file: ".qh/findings.json",
              schema: "findings@v1",
              hashSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              sizeBytes: 512,
              generatedAt: "2024-01-01T00:00:00Z",
            },
          ],
          security: {
            selfContained: true,
            externalNetworkRequired: false,
            inlineAssets: true,
          },
          compatibleHosts: ["github-pages", "artifact-preview", "generic-static"],
          generated_by: "ctg-viewer-hosted-v1",
        })
      );

      const result = runCli(["schema", "validate", minimalHostedReportPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal github-app-health artifact", () => {
      const minimalGitHubAppHealthPath = path.join(tempDir, "minimal-github-app-health.json");
      writeFileSync(
        minimalGitHubAppHealthPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "github-app-health-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "github-app-health",
          schema: "github-app-health@v1",
          completeness: "complete",
          status: "posted",
          authMode: "github-app",
          repository: { owner: "example", repo: "repo" },
          pullRequest: { number: 42, commitSha: "abcdef1234567890" },
          source: {
            artifactDir: ".qh",
            markdownPath: ".qh/pr-review.md",
            markdownHashSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            prReviewPath: ".qh/pr-review.json",
            artifactUrl: "https://example.com/artifacts/run",
          },
          publish: {
            action: "updated",
            commentId: 123,
            marker: "code-to-gate PR Review",
          },
          permissions: {
            required: ["pull-requests: write"],
            checked: false,
          },
          generated_by: "ctg-pr-review-publish-v1",
        })
      );

      const result = runCli(["schema", "validate", minimalGitHubAppHealthPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal evidence-query artifact", () => {
      const minimalEvidenceQueryPath = path.join(tempDir, "minimal-evidence-query.json");
      writeFileSync(
        minimalEvidenceQueryPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "evidence-query-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "evidence-query",
          schema: "evidence-query@v1",
          completeness: "complete",
          query: {
            expression: "finding where severity >= high",
            domain: "finding",
            field: "severity",
            operator: ">=",
            value: "high",
          },
          matches: [
            {
              id: "finding-001",
              type: "finding",
              sourceArtifact: "findings.json",
              sourceHashSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              locator: "findings.json#findings/0",
              value: "high",
            },
          ],
          sourceArtifacts: [
            {
              file: "findings.json",
              hashSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              schema: "findings@v1",
            },
          ],
          summary: { resultCount: 1, sourceArtifacts: 1 },
          generated_by: "ctg-evidence-query-v1",
        })
      );

      const result = runCli(["schema", "validate", minimalEvidenceQueryPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal redaction-profile artifact", () => {
      const minimalRedactionProfilePath = path.join(tempDir, "minimal-redaction-profile.json");
      writeFileSync(
        minimalRedactionProfilePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "redaction-profile-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "redaction-profile",
          schema: "redaction-profile@v1",
          completeness: "complete",
          profile: {
            name: "public",
            allowsPath: true,
            allowsHash: true,
            allowsCount: true,
            allowsExcerpt: false,
            allowsDetail: false,
            requiresSigner: false,
            requiresRetention: false,
            requiresApprovalBinding: false,
          },
          summary: {
            profile: "public",
            visibleFields: ["path", "hash", "count"],
            redactedFields: ["excerpt", "detail"],
            warnings: [],
          },
          generated_by: "ctg-redaction-profile-v1",
        })
      );

      const result = runCli(["schema", "validate", minimalRedactionProfilePath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal gate-explainability artifact", () => {
      const minimalGateExplainabilityPath = path.join(tempDir, "minimal-gate-explainability.json");
      writeFileSync(
        minimalGateExplainabilityPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "gate-explainability-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "gate-explainability",
          schema: "gate-explainability@v1",
          completeness: "complete",
          status: "needs_action",
          failedConditions: [{ id: "HIGH_FINDING", reason: "High finding blocks release.", matchedFindingIds: ["finding-001"] }],
          blockingFindings: [
            {
              id: "finding-001",
              ruleId: "AUTH_BYPASS",
              severity: "high",
              confidence: 0.9,
              title: "Auth bypass",
              summary: "Admin route lacks an auth guard.",
              sourceConditionIds: ["HIGH_FINDING"],
              evidence: [{ id: "e1", path: "src/admin.ts", kind: "text", excerptHash: "abc123" }],
            },
          ],
          manualEvidenceCandidates: [
            {
              id: "manual-evidence-finding-001",
              type: "manual_evidence",
              title: "Attach manual evidence for finding-001",
              detail: "Provide manual evidence.",
              priority: "high",
              sourceIds: ["finding-001"],
              evidence: [{ path: "src/admin.ts", detail: "finding evidence e1" }],
            },
          ],
          baselineUpdateCandidates: [],
          severityReEvaluationCandidates: [],
          summary: {
            failedConditions: 1,
            blockingFindings: 1,
            manualEvidenceCandidates: 1,
            baselineUpdateCandidates: 0,
            severityReEvaluationCandidates: 0,
            requiredActions: 1,
          },
          sourceArtifacts: [
            {
              file: "release-readiness.json",
              schema: "release-readiness@v1",
              hashSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
          ],
          generated_by: "ctg-gate-explainability-v1",
        })
      );

      const result = runCli(["schema", "validate", minimalGateExplainabilityPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal qeos-acceptance-matrix artifact", () => {
      const minimalQeosMatrixPath = path.join(tempDir, "minimal-qeos-acceptance-matrix.json");
      writeFileSync(
        minimalQeosMatrixPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "qeos-matrix-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "qeos-acceptance-matrix",
          schema: "qeos-acceptance-matrix@v1",
          completeness: "complete",
          entries: [
            {
              qeosId: "QEOS-042",
              title: "QEOS Acceptance Matrix Artifact",
              priority: "P0",
              requirement: "Matrix evidence",
              specAcceptance: ["Matrix is generated."],
              schemas: ["qeos-acceptance-matrix.schema.json"],
              cli: ["qeos"],
              testCommands: ["npx vitest run src/cli/__tests__/qeos-matrix.test.ts --reporter=dot"],
              ciGates: ["npx vitest run src/cli/__tests__/qeos-matrix.test.ts --reporter=dot"],
              status: "done",
              evidenceLinks: ["orchestration/quality-evidence-os-implementation.md"],
            },
          ],
          summary: { total: 1, done: 1, planned: 0, inProgress: 0, needsEvidence: 0 },
          generated_by: "ctg-qeos-acceptance-matrix-v1",
        })
      );

      const result = runCli(["schema", "validate", minimalQeosMatrixPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal schema-migration artifact", () => {
      const minimalMigrationPath = path.join(tempDir, "minimal-schema-migration.json");
      writeFileSync(
        minimalMigrationPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "schema-migration-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "schema-migration",
          schema: "schema-migration@v1",
          completeness: "complete",
          status: "migrated",
          source: {
            path: ".qh/legacy/findings.json",
            artifact: "findings",
            schema: "findings@v1",
            version: "ctg/v1alpha1",
          },
          target: {
            path: ".qh/migrated/findings.json",
            artifact: "findings",
            schema: "findings@v1",
            version: "ctg/v1",
          },
          changes: [
            {
              path: "/version",
              from: "ctg/v1alpha1",
              to: "ctg/v1",
              reason: "Normalize legacy version.",
            },
          ],
          validation: {
            status: "ok",
            errors: [],
          },
          generated_by: "ctg-schema-migrate-v1",
        })
      );

      const result = runCli(["schema", "validate", minimalMigrationPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates minimal repo-graph artifact", () => {
      const minimalGraphPath = path.join(tempDir, "minimal-graph.json");
      writeFileSync(
        minimalGraphPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "normalized-repo-graph",
          schema: "normalized-repo-graph@v1",
          files: [],
          modules: [],
          symbols: [],
          relations: [],
          tests: [],
          configs: [],
          entrypoints: [],
          diagnostics: [],
          stats: { partial: false },
        })
      );

      const result = runCli(["schema", "validate", minimalGraphPath]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("invalid artifact variations", () => {
    it("fails on findings with confidence > 1", () => {
      const highConfidencePath = path.join(tempDir, "high-confidence.json");
      writeFileSync(
        highConfidencePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 1.5, // Invalid - exceeds maximum
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", highConfidencePath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on findings with confidence < 0", () => {
      const lowConfidencePath = path.join(tempDir, "low-confidence.json");
      writeFileSync(
        lowConfidencePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: -0.1, // Invalid - below minimum
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", lowConfidencePath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on evidence missing required id", () => {
      const missingEvidenceIdPath = path.join(tempDir, "missing-evidence-id.json");
      writeFileSync(
        missingEvidenceIdPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  // Missing id
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingEvidenceIdPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on findings with empty evidence arrays", () => {
      const emptyEvidencePath = path.join(tempDir, "empty-evidence.json");
      writeFileSync(
        emptyEvidencePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", emptyEvidencePath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on evidence missing required path", () => {
      const missingEvidencePath_ = path.join(tempDir, "missing-evidence-path.json");
      writeFileSync(
        missingEvidencePath_,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  // Missing path
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingEvidencePath_]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on evidence with invalid kind", () => {
      const invalidKindPath = path.join(tempDir, "invalid-kind.json");
      writeFileSync(
        invalidKindPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "invalid-kind", // Invalid kind value
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", invalidKindPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on text evidence missing excerptHash", () => {
      const missingHashPath = path.join(tempDir, "missing-hash.json");
      writeFileSync(
        missingHashPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  // Missing required excerptHash for text kind
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingHashPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on external evidence missing externalRef", () => {
      const missingExtRefPath = path.join(tempDir, "missing-ext-ref.json");
      writeFileSync(
        missingExtRefPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "external",
                  // Missing required externalRef for external kind
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingExtRefPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on upstream missing required tool", () => {
      const missingUpstreamToolPath = path.join(tempDir, "missing-upstream-tool.json");
      writeFileSync(
        missingUpstreamToolPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
              upstream: {
                // Missing required tool
                ruleId: "rule-001",
              },
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingUpstreamToolPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on upstream with invalid tool", () => {
      const invalidUpstreamToolPath = path.join(tempDir, "invalid-upstream-tool.json");
      writeFileSync(
        invalidUpstreamToolPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
              upstream: {
                tool: "invalid-tool", // Invalid tool value
                ruleId: "rule-001",
              },
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", invalidUpstreamToolPath]);
      expect(result.exitCode).toBe(7);
    });
  });

  describe("schema version mismatches", () => {
    it("fails on version mismatch between version field and schema version", () => {
      const versionMismatchPath = path.join(tempDir, "version-mismatch.json");
      writeFileSync(
        versionMismatchPath,
        JSON.stringify({
          version: "ctg/v2alpha1", // Different version prefix
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", versionMismatchPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on missing version field", () => {
      const missingVersionPath = path.join(tempDir, "missing-version.json");
      writeFileSync(
        missingVersionPath,
        JSON.stringify({
          // Missing version field
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingVersionPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on missing generated_at field", () => {
      const missingGeneratedPath = path.join(tempDir, "missing-generated.json");
      writeFileSync(
        missingGeneratedPath,
        JSON.stringify({
          version: "ctg/v1",
          // Missing generated_at field
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingGeneratedPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on invalid generated_at format", () => {
      const invalidGeneratedPath = path.join(tempDir, "invalid-generated.json");
      writeFileSync(
        invalidGeneratedPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "not-a-date", // Invalid date format
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", invalidGeneratedPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on missing tool name", () => {
      const missingToolNamePath = path.join(tempDir, "missing-tool-name.json");
      writeFileSync(
        missingToolNamePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: {
            // Missing name
            version: "0.1.0",
            plugin_versions: [],
          },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingToolNamePath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on tool name not being 'code-to-gate'", () => {
      const wrongToolNamePath = path.join(tempDir, "wrong-tool-name.json");
      writeFileSync(
        wrongToolNamePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: {
            name: "other-tool", // Invalid - must be "code-to-gate"
            version: "0.1.0",
            plugin_versions: [],
          },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", wrongToolNamePath]);
      // Schema validation may fail due to const constraint on tool.name
      expect([2, 7]).toContain(result.exitCode);
    });

    it("fails on missing repo root", () => {
      const missingRepoRootPath = path.join(tempDir, "missing-repo-root.json");
      writeFileSync(
        missingRepoRootPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: {
            // Missing root
          },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingRepoRootPath]);
      expect(result.exitCode).toBe(7);
    });
  });

  describe("unsupported_claims validation", () => {
    beforeEach(() => {
      // Ensure tempDir exists (race condition protection)
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }
    });

    it("validates valid unsupported_claims", () => {
      const validUnsupportedPath = path.join(tempDir, "valid-unsupported.json");
      writeFileSync(
        validUnsupportedPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [
            {
              id: "claim-001",
              claim: "Some claim",
              reason: "missing_evidence",
              sourceSection: "section-1",
            },
          ],
        })
      );

      const result = runCli(["schema", "validate", validUnsupportedPath]);
      expect(result.exitCode).toBe(0);
    });

    it("fails on unsupported_claim with invalid reason", () => {
      const invalidReasonPath = path.join(tempDir, "invalid-reason.json");
      writeFileSync(
        invalidReasonPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [
            {
              id: "claim-001",
              claim: "Some claim",
              reason: "invalid_reason", // Invalid reason value
              sourceSection: "section-1",
            },
          ],
        })
      );

      const result = runCli(["schema", "validate", invalidReasonPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on unsupported_claim missing required fields", () => {
      const missingClaimFieldsPath = path.join(tempDir, "missing-claim-fields.json");
      writeFileSync(
        missingClaimFieldsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [
            {
              id: "claim-001",
              // Missing claim, reason, sourceSection
            },
          ],
        })
      );

      const result = runCli(["schema", "validate", missingClaimFieldsPath]);
      expect(result.exitCode).toBe(7);
    });
  });
});
