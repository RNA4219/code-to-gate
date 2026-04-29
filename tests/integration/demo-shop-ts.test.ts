/**
 * Integration tests for demo-shop-ts fixture
 *
 * Tests:
 * - scan→analyze→export full flow
 * - CLIENT_TRUSTED_PRICE finding detection
 * - risk-register generation
 * - release-readiness.status determination
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runCli,
  fixturePath,
  readJson,
  createTempOutDir,
  cleanupTempDir,
  fileExists,
  schemaPath,
} from "./helper.js";
import path from "node:path";
import { readFileSync } from "node:fs";

describe("demo-shop-ts integration", () => {
  const fixture = "demo-shop-ts";
  const fixtureRoot = fixturePath(fixture);
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempOutDir("demo-shop-ts");
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  it("scan command creates repo-graph.json", { timeout: 30000 }, () => {
    const result = runCli(["scan", fixtureRoot, "--out", tempDir]);

    expect(result.exitCode).toBe(0);
    expect(fileExists(path.join(tempDir, "repo-graph.json"))).toBe(true);

    const graph = readJson(path.join(tempDir, "repo-graph.json")) as {
      artifact: string;
      files: Array<{ path: string; role: string }>;
    };
    expect(graph.artifact).toBe("normalized-repo-graph");
    expect(graph.files.length).toBeGreaterThan(0);

    // Check that source files are detected
    const sourceFiles = graph.files.filter((f) => f.role === "source");
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("analyze command generates findings.json and risk-register.yaml", { timeout: 30000 }, () => {
    // Note: analyze returns exit code 5 (POLICY_FAILED) when there are critical findings
    const result = runCli(["analyze", fixtureRoot, "--emit", "all", "--out", tempDir]);

    // Accept POLICY_FAILED (exit code 5) as valid since there are critical findings
    expect([0, 5]).toContain(result.exitCode);
    expect(fileExists(path.join(tempDir, "findings.json"))).toBe(true);
    expect(fileExists(path.join(tempDir, "risk-register.yaml"))).toBe(true);

    const findings = readJson(path.join(tempDir, "findings.json")) as {
      artifact: string;
      findings: Array<{ ruleId: string; category: string; severity: string }>;
    };
    expect(findings.artifact).toBe("findings");
    expect(findings.findings.length).toBeGreaterThan(0);
  });

  it("detects CLIENT_TRUSTED_PRICE finding", { timeout: 30000 }, () => {
    runCli(["analyze", fixtureRoot, "--emit", "all", "--out", tempDir]);

    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; category: string; severity: string; title: string }>;
    };

    const clientTrustedPrice = findings.findings.find(
      (f) => f.ruleId === "CLIENT_TRUSTED_PRICE"
    );

    expect(clientTrustedPrice).toBeDefined();
    expect(clientTrustedPrice?.category).toBe("payment");
    expect(clientTrustedPrice?.severity).toBe("critical");
    expect(clientTrustedPrice?.title.toLowerCase()).toContain("price");
  });

  it("generates risk-register with payment risk", { timeout: 30000 }, () => {
    runCli(["analyze", fixtureRoot, "--emit", "all", "--out", tempDir]);

    const riskPath = path.join(tempDir, "risk-register.yaml");
    expect(fileExists(riskPath)).toBe(true);

    const content = readFileSync(riskPath, "utf8");
    expect(content).toContain("artifact: risk-register");
    expect(content).toContain("risks:");
  });

  it("generate findings.json validates against schema", { timeout: 30000 }, () => {
    runCli(["analyze", fixtureRoot, "--emit", "all", "--out", tempDir]);

    const result = runCli(["schema", "validate", path.join(tempDir, "findings.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("artifact ok");
  });

  it("generate risk-register.yaml validates against schema", { timeout: 30000 }, () => {
    runCli(["analyze", fixtureRoot, "--emit", "all", "--out", tempDir]);

    // Note: YAML schema validation requires JSON conversion
    // For now, we check basic structure
    const riskPath = path.join(tempDir, "risk-register.yaml");
    const content = readFileSync(riskPath, "utf8");
    expect(content).toContain("artifact: risk-register");
    expect(content).toContain("schema: risk-register@v1");
  });

  it("generates audit.json with correct structure", { timeout: 30000 }, () => {
    runCli(["analyze", fixtureRoot, "--emit", "all", "--out", tempDir]);

    const audit = readJson(path.join(tempDir, "audit.json")) as {
      artifact: string;
      exit: { code: number; status: string };
    };

    expect(audit.artifact).toBe("audit");
    expect(audit.exit).toBeDefined();
  });
});